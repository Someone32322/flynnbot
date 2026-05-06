const { SlashCommandBuilder } = require("discord.js");
const {
  buildActionDm,
  buildStaffReply,
  checkImmuneRoles,
  createModerationCase,
  ensureTargetModeratable,
  ephemeral,
  getAuditColor,
  getModerationConfig,
  logCaseToAudit,
  requireModeratorAccess,
  resolveModerationTarget,
  sendDmNotice,
  shouldSendDm,
} = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user.")
    .addUserOption((option) => option.setName("user").setDescription("User to warn").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Warning reason").setRequired(false).setAutocomplete(true)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const target = await resolveModerationTarget(interaction, "user", "unused_user_id");
    if (!target) {
      await interaction.reply(ephemeral("Usage: /warn <user> [reason]"));
      return;
    }

    if (!(await ensureTargetModeratable(interaction, target.targetMember))) {
      return;
    }

    // Check immune roles from dashboard config
    const modConfig = await getModerationConfig(interaction.guildId);
    if (target.targetMember && !(await checkImmuneRoles(interaction, target.targetMember, "warn", modConfig))) {
      return;
    }

    const reason = interaction.options.getString("reason") || "No reason provided.";
    const dmResult = shouldSendDm(modConfig, "onPunish")
      ? await sendDmNotice(target.targetUser, buildActionDm("warn", interaction.guild.name, interaction.user.tag, reason))
      : { delivered: false, suffix: "DM disabled by server settings" };

    const caseDocument = await createModerationCase({
      guild: interaction.guild,
      moderator: interaction.user,
      targetUser: target.targetUser,
      type: "warn",
      reason,
      dmDelivered: dmResult.delivered,
      metadata: { dmStatus: dmResult.suffix },
    });

    await logCaseToAudit(
      interaction.guild,
      guildConfig,
      caseDocument,
      [{ name: "DM Status", value: dmResult.suffix, inline: true }],
      getAuditColor("warn")
    );

    await interaction.reply(
      buildStaffReply("warn", { targetUser: target.targetUser, caseDocument, dmResult })
    );
  },
  async autocomplete(interaction) {
    const { PredefinedReasons } = require('../../models/PredefinedReasons');
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'reason') return;
    const doc = await PredefinedReasons.findOne({ guildId: interaction.guildId, action: 'warn' }).lean().catch(() => null);
    const reasons = doc?.reasons ?? [];
    const filtered = reasons.filter((r) => {
      const search = focused.value.toLowerCase();
      return r.name.toLowerCase().includes(search) || r.value.toLowerCase().includes(search);
    });
    await interaction.respond(filtered.slice(0, 25).map((r) => ({ name: r.name.slice(0, 100), value: r.value.slice(0, 100) }))).catch(() => null);
  },
};

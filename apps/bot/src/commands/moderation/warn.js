const { SlashCommandBuilder } = require("discord.js");
const {
  buildActionDm,
  buildStaffReply,
  createModerationCase,
  ensureTargetModeratable,
  ephemeral,
  getAuditColor,
  logCaseToAudit,
  requireModeratorAccess,
  resolveModerationTarget,
  sendDmNotice,
} = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user.")
    .addUserOption((option) => option.setName("user").setDescription("User to warn").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Warning reason").setRequired(false)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const target = await resolveModerationTarget(interaction, "user", "unused_user_id");
    if (!target || !(await ensureTargetModeratable(interaction, target.targetMember))) {
      return;
    }

    const reason = interaction.options.getString("reason") || "No reason provided.";
    const dmResult = await sendDmNotice(
      target.targetUser,
      buildActionDm("warn", interaction.guild.name, interaction.user.tag, reason)
    );

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
};

const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const {
  buildActionDm,
  checkImmuneRoles,
  createModerationCase,
  ephemeral,
  getAuditColor,
  getGuildConfig,
  getModerationConfig,
  hasAdminAccess,
  logCaseToAudit,
  parseDurationOption,
  buildStaffReply,
  resolveModerationTarget,
  scheduleTimedAction,
  sendDmNotice,
  shouldSendDm,
} = require("../../lib/moderation");

function canModerateTarget(interaction, targetMember) {
  if (!targetMember) {
    return true;
  }

  if (interaction.user.id === targetMember.id) {
    return false;
  }

  if (interaction.guild.ownerId === targetMember.id) {
    return false;
  }

  if (interaction.user.id === interaction.guild.ownerId) {
    return true;
  }

  return interaction.member.roles.highest.comparePositionTo(targetMember.roles.highest) > 0;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user by mention or user ID.")
    .addUserOption((option) => option.setName("user").setDescription("User to ban").setRequired(false))
    .addStringOption((option) => option.setName("user_id").setDescription("User ID to ban").setRequired(false))
    .addStringOption((option) => option.setName("time").setDescription("Optional ban duration like 1d").setRequired(false))
    .addStringOption((option) => option.setName("reason").setDescription("Ban reason").setRequired(false).setAutocomplete(true)),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildConfig = await getGuildConfig(interaction.guildId);
    if (!hasAdminAccess(interaction)) {
      const moderatorRoleId = guildConfig.moderation?.moderatorRoleId;
      if (!moderatorRoleId) {
        await interaction.editReply(ephemeral("No moderator role is configured yet. Use /setmodrole first."));
        return;
      }

      if (!interaction.member.roles.cache.has(moderatorRoleId)) {
        await interaction.editReply(ephemeral("You do not have the configured moderator role."));
        return;
      }
    }

    const target = await resolveModerationTarget(interaction);
    if (!target) {
      await interaction.editReply(ephemeral("Usage: /ban <user or user_id> [time] [reason]"));
      return;
    }

    if (target.targetMember) {
      if (!canModerateTarget(interaction, target.targetMember)) {
        await interaction.editReply(
          ephemeral("You cannot moderate that user because of ownership, self-targeting, or role hierarchy.")
        );
        return;
      }

      if (!target.targetMember.bannable) {
        await interaction.editReply(
          ephemeral("The bot cannot ban that user with the current role hierarchy/permissions.")
        );
        return;
      }
    }

    // Check immune roles from dashboard config
    const modConfig = await getModerationConfig(interaction.guildId);
    if (target.targetMember && !(await checkImmuneRoles(interaction, target.targetMember, "ban", modConfig))) {
      return;
    }

    const reason = interaction.options.getString("reason") || "No reason provided.";
    const durationMs = parseDurationOption(interaction, "time");
    if (interaction.options.getString("time") && !durationMs) {
      await interaction.editReply(ephemeral("Use a valid duration like 1s, 1m, 1h, 1d, or 1y."));
      return;
    }

    const dmResult = shouldSendDm(modConfig, "onPunish")
      ? await sendDmNotice(target.targetUser, buildActionDm("ban", interaction.guild.name, interaction.user.tag, reason, durationMs))
      : { delivered: false, suffix: "DM disabled by server settings" };

    await interaction.guild.members.ban(target.targetUser.id, { reason });
    const caseDocument = await createModerationCase({
      guild: interaction.guild,
      moderator: interaction.user,
      targetUser: target.targetUser,
      type: "ban",
      reason,
      active: true,
      durationMs,
      dmDelivered: dmResult.delivered,
      metadata: { dmStatus: dmResult.suffix },
    });

    if (durationMs) {
      await scheduleTimedAction({
        guildId: interaction.guildId,
        caseDocument,
        actionType: "unban",
        executeAt: caseDocument.expiresAt,
        targetUserId: target.targetUser.id,
      });
    }

    await logCaseToAudit(
      interaction.guild,
      guildConfig,
      caseDocument,
      [{ name: "DM Status", value: dmResult.suffix, inline: true }],
      getAuditColor("ban")
    );

    await interaction.editReply(
      buildStaffReply("ban", { targetUser: target.targetUser, caseDocument, dmResult })
    );
  },
  async autocomplete(interaction) {
    const { PredefinedReasons } = require('../../models/PredefinedReasons');
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'reason') return;
    const doc = await PredefinedReasons.findOne({ guildId: interaction.guildId, action: 'ban' }).lean().catch(() => null);
    const reasons = doc?.reasons ?? [];
    const filtered = reasons.filter((r) => {
      const search = focused.value.toLowerCase();
      return r.name.toLowerCase().includes(search) || r.value.toLowerCase().includes(search);
    });
    await interaction.respond(filtered.slice(0, 25).map((r) => ({ name: r.name.slice(0, 100), value: r.value.slice(0, 100) }))).catch(() => null);
  },
};

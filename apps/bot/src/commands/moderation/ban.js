const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const {
  buildActionDm,
  createModerationCase,
  ephemeral,
  getAuditColor,
  getGuildConfig,
  hasAdminAccess,
  logCaseToAudit,
  parseDurationOption,
  buildStaffReply,
  resolveModerationTarget,
  scheduleTimedAction,
  sendDmNotice,
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
    .addStringOption((option) => option.setName("reason").setDescription("Ban reason").setRequired(false)),
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
      await interaction.editReply(ephemeral("Provide a user or user ID to ban."));
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

    const reason = interaction.options.getString("reason") || "No reason provided.";
    const durationMs = parseDurationOption(interaction, "time");
    if (interaction.options.getString("time") && !durationMs) {
      await interaction.editReply(ephemeral("Use a valid duration like 1s, 1m, 1h, 1d, or 1y."));
      return;
    }

    const dmResult = await sendDmNotice(
      target.targetUser,
      buildActionDm("ban", interaction.guild.name, interaction.user.tag, reason, durationMs)
    );

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
};

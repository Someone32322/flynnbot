const { SlashCommandBuilder } = require("discord.js");
const {
  MAX_TIMEOUT_MS,
  buildActionDm,
  buildStaffReply,
  createModerationCase,
  ensureTargetModeratable,
  ensureTimeoutWithinLimits,
  ephemeral,
  getAuditColor,
  logCaseToAudit,
  parseDurationOption,
  requireModeratorAccess,
  resolveModerationTarget,
  scheduleTimedAction,
  sendDmNotice,
} = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Mute a user with a native Discord timeout.")
    .addUserOption((option) => option.setName("user").setDescription("Member to mute").setRequired(true))
    .addStringOption((option) => option.setName("time").setDescription("Duration like 1h or 2d").setRequired(false))
    .addStringOption((option) => option.setName("reason").setDescription("Mute reason").setRequired(false)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const target = await resolveModerationTarget(interaction, "user", "unused_user_id");
    if (!target?.targetMember || !(await ensureTargetModeratable(interaction, target.targetMember))) {
      return;
    }

    const reason = interaction.options.getString("reason") || "No reason provided.";
    const parsedDuration = parseDurationOption(interaction, "time");
    if (interaction.options.getString("time") && !parsedDuration) {
      await interaction.reply(ephemeral("Use a valid duration like 1s, 1m, 1h, 1d, or 1y."));
      return;
    }

    const durationMs = parsedDuration || MAX_TIMEOUT_MS;
    if (!(await ensureTimeoutWithinLimits(interaction, durationMs))) {
      return;
    }

    const dmResult = await sendDmNotice(
      target.targetUser,
      buildActionDm("mute", interaction.guild.name, interaction.user.tag, reason, durationMs)
    );

    await target.targetMember.timeout(durationMs, reason);
    const caseDocument = await createModerationCase({
      guild: interaction.guild,
      moderator: interaction.user,
      targetUser: target.targetUser,
      type: "mute",
      reason,
      active: true,
      durationMs,
      dmDelivered: dmResult.delivered,
      metadata: { dmStatus: dmResult.suffix, usedDefaultLimit: !parsedDuration },
    });

    await scheduleTimedAction({
      guildId: interaction.guildId,
      caseDocument,
      actionType: "unmute",
      executeAt: caseDocument.expiresAt,
      targetUserId: target.targetUser.id,
    });

    await logCaseToAudit(
      interaction.guild,
      guildConfig,
      caseDocument,
      [{ name: "DM Status", value: dmResult.suffix, inline: true }],
      getAuditColor("mute")
    );

    await interaction.reply(
      buildStaffReply("mute", { targetUser: target.targetUser, caseDocument, dmResult, defaultDuration: !parsedDuration })
    );
  },
};

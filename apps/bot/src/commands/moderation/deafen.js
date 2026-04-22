const { SlashCommandBuilder } = require("discord.js");
const {
  buildStaffReply,
  createModerationCase,
  ensureTargetModeratable,
  ephemeral,
  getAuditColor,
  logCaseToAudit,
  parseDurationOption,
  requireModeratorAccess,
  resolveModerationTarget,
  scheduleTimedAction,
} = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("deafen")
    .setDescription("Server deafen a user in voice.")
    .addUserOption((option) => option.setName("user").setDescription("Member to deafen").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Deafen reason").setRequired(false))
    .addStringOption((option) => option.setName("time").setDescription("Optional duration like 1h").setRequired(false)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const target = await resolveModerationTarget(interaction, "user", "unused_user_id");
    if (!target?.targetMember || !(await ensureTargetModeratable(interaction, target.targetMember))) {
      return;
    }

    if (!target.targetMember.voice.channelId) {
      await interaction.reply(ephemeral("That member is not in a voice channel."));
      return;
    }

    const reason = interaction.options.getString("reason") || "No reason provided.";
    const durationMs = parseDurationOption(interaction, "time");
    if (interaction.options.getString("time") && !durationMs) {
      await interaction.reply(ephemeral("Use a valid duration like 1s, 1m, 1h, 1d, or 1y."));
      return;
    }

    await target.targetMember.voice.setDeaf(true, reason);
    const caseDocument = await createModerationCase({
      guild: interaction.guild,
      moderator: interaction.user,
      targetUser: target.targetUser,
      type: "deafen",
      reason,
      active: true,
      durationMs,
    });

    if (durationMs) {
      await scheduleTimedAction({
        guildId: interaction.guildId,
        caseDocument,
        actionType: "undeafen",
        executeAt: caseDocument.expiresAt,
        targetUserId: target.targetUser.id,
      });
    }

    await logCaseToAudit(interaction.guild, guildConfig, caseDocument, [], getAuditColor("deafen"));
    await interaction.reply(buildStaffReply("deafen", { targetUser: target.targetUser, caseDocument }));
  },
};

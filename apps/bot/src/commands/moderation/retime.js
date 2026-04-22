const { SlashCommandBuilder } = require("discord.js");
const {
  buildStaffReply,
  ephemeral,
  ensureTimeoutWithinLimits,
  findCase,
  formatDuration,
  getAuditColor,
  getTargetMember,
  logCaseToAudit,
  parseDurationOption,
  requireModeratorAccess,
  scheduleTimedAction,
  updateCaseDuration,
} = require("../../lib/moderation");

const ACTION_TYPES = {
  ban: "unban",
  mute: "unmute",
  deafen: "undeafen",
  vcmute: "unvcmute",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("retime")
    .setDescription("Alias for /duration.")
    .addStringOption((option) => option.setName("case").setDescription("Case ID").setRequired(true))
    .addStringOption((option) => option.setName("time").setDescription("New duration, like 1h or 2d").setRequired(true)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const caseNumber = interaction.options.getString("case", true);
    const durationMs = parseDurationOption(interaction, "time");
    if (!durationMs) {
      await interaction.reply(ephemeral("Use a valid duration like 1s, 1m, 1h, 1d, or 1y."));
      return;
    }

    const caseDocument = await findCase(interaction.guildId, caseNumber);
    if (!caseDocument || !ACTION_TYPES[caseDocument.type]) {
      await interaction.reply(ephemeral("That case cannot be retimed with this command."));
      return;
    }

    if (caseDocument.type === "mute" && !(await ensureTimeoutWithinLimits(interaction, durationMs))) {
      return;
    }

    await updateCaseDuration(caseDocument, durationMs);
    await scheduleTimedAction({
      guildId: interaction.guildId,
      caseDocument,
      actionType: ACTION_TYPES[caseDocument.type],
      executeAt: caseDocument.expiresAt,
      targetUserId: caseDocument.targetUserId,
      roleId: caseDocument.metadata?.roleId || null,
      channelId: caseDocument.metadata?.channelId || null,
      channelIds: caseDocument.metadata?.channelIds || [],
    });

    if (caseDocument.type === "mute") {
      const targetMember = await getTargetMember(interaction.guild, caseDocument.targetUserId);
      if (targetMember) {
        await targetMember.timeout(durationMs, `Case #${caseDocument.caseNumber} duration updated`).catch(() => null);
      }
    }

    await logCaseToAudit(interaction.guild, guildConfig, caseDocument, [], getAuditColor("retime"));
    await interaction.reply(
      buildStaffReply("retime", { caseDocument, duration: formatDuration(durationMs) })
    );
  },
};

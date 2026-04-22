const { SlashCommandBuilder } = require("discord.js");
const {
  buildStaffReply,
  createModerationCase,
  ephemeral,
  getAuditColor,
  getLockableChannels,
  logCaseToAudit,
  parseDurationOption,
  requireModeratorAccess,
  scheduleTimedAction,
} = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Lock down all manageable text channels.")
    .addStringOption((option) => option.setName("reason").setDescription("Lockdown reason").setRequired(false))
    .addStringOption((option) => option.setName("time").setDescription("Optional duration like 1h").setRequired(false)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const reason = interaction.options.getString("reason") || "No reason provided.";
    const durationMs = parseDurationOption(interaction, "time");
    if (interaction.options.getString("time") && !durationMs) {
      await interaction.reply(ephemeral("Use a valid duration like 1s, 1m, 1h, 1d, or 1y."));
      return;
    }

    const channels = getLockableChannels(interaction.guild);
    for (const channel of channels.values()) {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false }, { reason }).catch(() => null);
    }

    const caseDocument = await createModerationCase({
      guild: interaction.guild,
      moderator: interaction.user,
      targetUser: interaction.user,
      type: "lockdown",
      reason,
      active: true,
      durationMs,
      metadata: { channelIds: [...channels.keys()] },
    });

    if (durationMs) {
      await scheduleTimedAction({
        guildId: interaction.guildId,
        caseDocument,
        actionType: "unlock_lockdown",
        executeAt: caseDocument.expiresAt,
        channelIds: [...channels.keys()],
      });
    }

    await interaction.channel.send(`Server lockdown enabled by ${interaction.user}.`).catch(() => null);
    await logCaseToAudit(interaction.guild, guildConfig, caseDocument, [], getAuditColor("lockdown"));
    await interaction.reply(buildStaffReply("lockdown", { channels, caseDocument }));
  },
};

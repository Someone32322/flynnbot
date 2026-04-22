const { ChannelType, SlashCommandBuilder } = require("discord.js");
const {
  buildStaffReply,
  createModerationCase,
  ephemeral,
  getAuditColor,
  logCaseToAudit,
  parseDurationOption,
  requireModeratorAccess,
  scheduleTimedAction,
} = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock a text channel.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to lock")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addStringOption((option) => option.setName("message").setDescription("Message to send in the channel").setRequired(false))
    .addStringOption((option) => option.setName("reason").setDescription("Lock reason").setRequired(false))
    .addStringOption((option) => option.setName("time").setDescription("Optional duration like 1h").setRequired(false)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const channel = interaction.options.getChannel("channel") || interaction.channel;
    const reason = interaction.options.getString("reason") || "No reason provided.";
    const durationMs = parseDurationOption(interaction, "time");
    const message = interaction.options.getString("message");

    if (interaction.options.getString("time") && !durationMs) {
      await interaction.reply(ephemeral("Use a valid duration like 1s, 1m, 1h, 1d, or 1y."));
      return;
    }

    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false }, { reason });
    if (message) {
      await channel.send(message).catch(() => null);
    }

    const caseDocument = await createModerationCase({
      guild: interaction.guild,
      moderator: interaction.user,
      targetUser: interaction.user,
      type: "lock",
      reason,
      active: true,
      durationMs,
      metadata: { channelId: channel.id, message },
    });

    if (durationMs) {
      await scheduleTimedAction({
        guildId: interaction.guildId,
        caseDocument,
        actionType: "unlock_channel",
        executeAt: caseDocument.expiresAt,
        channelId: channel.id,
      });
    }

    await logCaseToAudit(interaction.guild, guildConfig, caseDocument, [], getAuditColor("lock"));
    await interaction.reply(buildStaffReply("lock", { channel, caseDocument }));
  },
};

const { ChannelType, SlashCommandBuilder } = require("discord.js");
const { ModerationCase } = require("../../models/ModerationCase");
const { closeCase, buildStaffReply, ephemeral, getAuditColor, logToAuditChannel, requireModeratorAccess } = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock a text channel.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to unlock")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addStringOption((option) => option.setName("message").setDescription("Message to send in the channel").setRequired(false)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const channel = interaction.options.getChannel("channel") || interaction.channel;
    const message = interaction.options.getString("message");
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
    if (message) {
      await channel.send(message).catch(() => null);
    }

    const activeCases = await ModerationCase.find({ guildId: interaction.guildId, type: "lock", active: true, "metadata.channelId": channel.id });
    for (const caseDocument of activeCases) {
      await closeCase(caseDocument, `Manual unlock by ${interaction.user.tag}`);
    }

    await logToAuditChannel(
      interaction.guild,
      guildConfig,
      "Channel unlocked",
      [
        { name: "Channel", value: `<#${channel.id}>`, inline: true },
        { name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
      ],
      getAuditColor("unlock")
    );

    await interaction.reply(buildStaffReply("unlock", { channel }));
  },
};

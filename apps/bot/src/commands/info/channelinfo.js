const { ChannelType, EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const SAPPHIRE = 0x0f52ba;

const CHANNEL_TYPES = {
  [ChannelType.GuildText]: 'Text',
  [ChannelType.GuildVoice]: 'Voice',
  [ChannelType.GuildCategory]: 'Category',
  [ChannelType.GuildAnnouncement]: 'Announcement',
  [ChannelType.GuildStageVoice]: 'Stage',
  [ChannelType.GuildForum]: 'Forum',
  [ChannelType.GuildMedia]: 'Media',
  [ChannelType.PrivateThread]: 'Private Thread',
  [ChannelType.PublicThread]: 'Public Thread',
  [ChannelType.AnnouncementThread]: 'Announcement Thread',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('channelinfo')
    .setDescription('Display detailed information about a channel.')
    .addChannelOption((o) => o.setName('channel').setDescription('Channel to inspect (defaults to current)')),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;

    const typeLabel = CHANNEL_TYPES[channel.type] ?? `Unknown (${channel.type})`;
    const created = `<t:${Math.floor(channel.createdTimestamp / 1000)}:F>`;

    const lines = [
      `> **Name:** ${channel.name}`,
      `> **ID:** \`${channel.id}\``,
      `> **Type:** ${typeLabel}`,
      `> **Created:** ${created}`,
      channel.parent ? `> **Category:** ${channel.parent.name}` : null,
      channel.topic ? `> **Topic:** ${channel.topic.slice(0, 500)}` : null,
      ('rateLimitPerUser' in channel && channel.rateLimitPerUser > 0) ? `> **Slowmode:** ${channel.rateLimitPerUser}s` : null,
      ('nsfw' in channel) ? `> **NSFW:** ${channel.nsfw ? 'Yes' : 'No'}` : null,
      ('userLimit' in channel && channel.userLimit) ? `> **User Limit:** ${channel.userLimit}` : null,
      ('bitrate' in channel) ? `> **Bitrate:** ${channel.bitrate / 1000}kbps` : null,
      ('position' in channel) ? `> **Position:** ${channel.position}` : null,
    ].filter(Boolean);

    const embed = new EmbedBuilder()
      .setColor(SAPPHIRE)
      .setTitle(`#${channel.name}`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `ID: ${channel.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

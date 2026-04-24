const { ChannelType, EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const SAPPHIRE = 0x0f52ba;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guildchannelcount')
    .setDescription('Show a breakdown of all channel types in this server.'),

  async execute(interaction) {
    const channels = interaction.guild.channels.cache;

    const counts = {
      text: 0, voice: 0, category: 0, announcement: 0,
      stage: 0, forum: 0, media: 0, thread: 0,
    };

    for (const ch of channels.values()) {
      if (ch.type === ChannelType.GuildText) counts.text++;
      else if (ch.type === ChannelType.GuildVoice) counts.voice++;
      else if (ch.type === ChannelType.GuildCategory) counts.category++;
      else if (ch.type === ChannelType.GuildAnnouncement) counts.announcement++;
      else if (ch.type === ChannelType.GuildStageVoice) counts.stage++;
      else if (ch.type === ChannelType.GuildForum) counts.forum++;
      else if (ch.type === ChannelType.GuildMedia) counts.media++;
      else if ([ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread].includes(ch.type)) counts.thread++;
    }

    const embed = new EmbedBuilder()
      .setColor(SAPPHIRE)
      .setTitle(`${interaction.guild.name} — Channel Breakdown`)
      .setDescription([
        `> **Total:** ${channels.size}`,
        `> **📝 Text:** ${counts.text}`,
        `> **🔊 Voice:** ${counts.voice}`,
        `> **📁 Categories:** ${counts.category}`,
        `> **📣 Announcement:** ${counts.announcement}`,
        `> **🎙️ Stage:** ${counts.stage}`,
        `> **💬 Forum:** ${counts.forum}`,
        `> **🎞️ Media:** ${counts.media}`,
        `> **🧵 Threads:** ${counts.thread}`,
      ].join('\n'))
      .setThumbnail(interaction.guild.iconURL({ size: 256 }))
      .setFooter({ text: `Guild ID: ${interaction.guild.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

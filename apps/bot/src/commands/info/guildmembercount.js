const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const SAPPHIRE = 0x0f52ba;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guildmembercount')
    .setDescription('Display a member count breakdown for this server.'),

  async execute(interaction) {
    const guild = interaction.guild;
    const total = guild.memberCount;
    const cached = guild.members.cache;

    const bots = cached.filter((m) => m.user.bot).size;
    const humans = total - bots;
    const online = cached.filter((m) => m.presence?.status === 'online').size;
    const idle = cached.filter((m) => m.presence?.status === 'idle').size;
    const dnd = cached.filter((m) => m.presence?.status === 'dnd').size;
    const offline = total - online - idle - dnd;

    const embed = new EmbedBuilder()
      .setColor(SAPPHIRE)
      .setTitle(`${guild.name} — Member Count`)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .setDescription([
        `> **👥 Total:** ${total}`,
        `> **🧑 Humans:** ${humans}`,
        `> **🤖 Bots:** ${bots}`,
        `> **🟢 Online:** ${online}`,
        `> **🌙 Idle:** ${idle}`,
        `> **⛔ DND:** ${dnd}`,
        `> **⚫ Offline:** ${offline}`,
      ].join('\n'))
      .setFooter({ text: `Guild ID: ${guild.id} · Statuses from cached members only` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

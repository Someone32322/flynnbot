const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const SAPPHIRE = 0x0f52ba;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guildiconinfo')
    .setDescription("Display the server's icon with download links."),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild.icon) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(SAPPHIRE).setDescription('This server does not have an icon set.')],
        ephemeral: true,
      });
      return;
    }

    const iconUrl = guild.iconURL({ extension: 'png', size: 4096 });
    const iconGif = guild.icon.startsWith('a_') ? guild.iconURL({ extension: 'gif', size: 4096 }) : null;
    const links = ['PNG', 'WEBP', ...(iconGif ? ['GIF'] : [])].map(
      (f) => `[${f}](${guild.iconURL({ extension: f.toLowerCase(), size: 4096 })})`
    ).join(' · ');

    const embed = new EmbedBuilder()
      .setColor(SAPPHIRE)
      .setTitle(`${guild.name} — Server Icon`)
      .setImage(iconGif ?? iconUrl)
      .setDescription([
        `> **Animated:** ${iconGif ? 'Yes' : 'No'}`,
        `> **Links:** ${links}`,
      ].join('\n'))
      .setFooter({ text: `Guild ID: ${guild.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const SAPPHIRE = 0x0f52ba;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guildsplashinfo')
    .setDescription("Display the server's invite splash image."),

  async execute(interaction) {
    const guild = await interaction.guild.fetch();
    if (!guild.splash) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(SAPPHIRE).setDescription('This server does not have an invite splash set.')],
        ephemeral: true,
      });
      return;
    }

    const splashUrl = guild.splashURL({ extension: 'png', size: 4096 });
    const links = ['PNG', 'WEBP', 'JPEG'].map(
      (f) => `[${f}](${guild.splashURL({ extension: f.toLowerCase(), size: 4096 })})`
    ).join(' · ');

    const embed = new EmbedBuilder()
      .setColor(SAPPHIRE)
      .setTitle(`${guild.name} — Invite Splash`)
      .setImage(splashUrl)
      .setDescription(`> **Links:** ${links}`)
      .setFooter({ text: `Guild ID: ${guild.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

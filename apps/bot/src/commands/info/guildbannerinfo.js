const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const SAPPHIRE = 0x0f52ba;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guildbannerinfo')
    .setDescription("Display the server's banner image."),

  async execute(interaction) {
    const guild = await interaction.guild.fetch();
    if (!guild.banner) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(SAPPHIRE).setDescription('This server does not have a banner set.')],
        ephemeral: true,
      });
      return;
    }

    const bannerUrl = guild.bannerURL({ extension: 'png', size: 4096 });
    const bannerGif = guild.banner.startsWith('a_')
      ? guild.bannerURL({ extension: 'gif', size: 4096 })
      : null;
    const links = ['PNG', 'WEBP', ...(bannerGif ? ['GIF'] : [])].map(
      (f) => `[${f}](${guild.bannerURL({ extension: f.toLowerCase(), size: 4096 })})`
    ).join(' · ');

    const embed = new EmbedBuilder()
      .setColor(SAPPHIRE)
      .setTitle(`${guild.name} — Server Banner`)
      .setImage(bannerGif ?? bannerUrl)
      .setDescription(`> **Links:** ${links}`)
      .setFooter({ text: `Guild ID: ${guild.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

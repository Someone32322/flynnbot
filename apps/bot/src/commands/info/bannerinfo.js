const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const SAPPHIRE = 0x0f52ba;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bannerinfo')
    .setDescription("Display a user's profile banner with download links.")
    .addUserOption((o) => o.setName('user').setDescription('User to inspect (defaults to yourself)')),

  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    // Must force-fetch to get banner
    const fetched = await interaction.client.users.fetch(target.id, { force: true }).catch(() => null);

    if (!fetched?.banner) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(SAPPHIRE)
            .setDescription(`**${target.username}** does not have a profile banner set.`)
            .setFooter({ text: `ID: ${target.id}` }),
        ],
        ephemeral: true,
      });
      return;
    }

    const bannerUrl = fetched.bannerURL({ extension: 'png', size: 4096 });
    const bannerGif = fetched.banner.startsWith('a_')
      ? fetched.bannerURL({ extension: 'gif', size: 4096 })
      : null;
    const links = ['PNG', 'WEBP', ...(bannerGif ? ['GIF'] : [])].map(
      (f) => `[${f}](${fetched.bannerURL({ extension: f.toLowerCase(), size: 4096 })})`
    ).join(' · ');

    const lines = [
      `> **User:** ${target} \`(${target.id})\``,
      `> **Animated:** ${bannerGif ? 'Yes' : 'No'}`,
      `> **Accent Colour:** ${fetched.accentColor ? `#${fetched.accentColor.toString(16).padStart(6, '0')}` : 'None'}`,
      `> **Links:** ${links}`,
    ];

    const embed = new EmbedBuilder()
      .setColor(SAPPHIRE)
      .setTitle(`${target.username}'s Banner`)
      .setImage(bannerGif ?? bannerUrl)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `ID: ${target.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

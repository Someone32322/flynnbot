const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const SAPPHIRE = 0x0f52ba;
const STICKER_FORMATS = { 1: 'PNG', 2: 'APNG', 3: 'Lottie', 4: 'GIF' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stickerpackinfo')
    .setDescription("Display information about a Discord sticker pack by name.")
    .addStringOption((o) =>
      o.setName('name').setDescription('Pack name to look up').setRequired(true)
    ),

  async execute(interaction) {
    const name = interaction.options.getString('name', true).toLowerCase();

    let packs = [];
    try {
      packs = await interaction.client.fetchStickerPacks().then((c) => [...c.values()]).catch(() => []);
    } catch {
      packs = [];
    }

    const pack = packs.find(
      (p) => p.name.toLowerCase() === name || p.name.toLowerCase().includes(name)
    );

    if (!pack) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(SAPPHIRE).setDescription(`No sticker pack found matching \`${name}\`.`)],
        ephemeral: true,
      });
      return;
    }

    const stickerLines = pack.stickers.size
      ? [...pack.stickers.values()].slice(0, 10).map((s) => `> • ${s.name}`).join('\n')
      : '> None listed';

    const embed = new EmbedBuilder()
      .setColor(SAPPHIRE)
      .setTitle(pack.name)
      .setDescription([
        `> **ID:** \`${pack.id}\``,
        `> **Sticker Count:** ${pack.stickers.size}`,
        `> **Stickers (first 10):**`,
        stickerLines,
      ].join('\n'))
      .setFooter({ text: `Pack ID: ${pack.id}` })
      .setTimestamp();

    if (pack.bannerURL) embed.setImage(pack.bannerURL({ size: 1024 }));

    await interaction.reply({ embeds: [embed] });
  },
};

const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const SAPPHIRE = 0x0f52ba;

const STICKER_FORMATS = { 1: 'PNG', 2: 'APNG', 3: 'Lottie', 4: 'GIF' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stickerinfo')
    .setDescription('Display information about a guild sticker by name.')
    .addStringOption((o) =>
      o.setName('name').setDescription('The sticker name to look up').setRequired(true)
    ),

  async execute(interaction) {
    const name = interaction.options.getString('name', true).toLowerCase();
    await interaction.guild.stickers.fetch().catch(() => null);

    const sticker = interaction.guild.stickers.cache.find(
      (s) => s.name.toLowerCase() === name || s.name.toLowerCase().includes(name)
    );

    if (!sticker) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(SAPPHIRE).setDescription(`No sticker found matching \`${name}\`.`)],
        ephemeral: true,
      });
      return;
    }

    const created = `<t:${Math.floor(sticker.createdTimestamp / 1000)}:F>`;
    const url = sticker.url;

    const lines = [
      `> **ID:** \`${sticker.id}\``,
      `> **Format:** ${STICKER_FORMATS[sticker.format] ?? 'Unknown'}`,
      `> **Available:** ${sticker.available ? 'Yes' : 'No'}`,
      `> **Created:** ${created}`,
      sticker.description ? `> **Description:** ${sticker.description}` : null,
      sticker.tags ? `> **Tags:** ${sticker.tags}` : null,
    ].filter(Boolean);

    const embed = new EmbedBuilder()
      .setColor(SAPPHIRE)
      .setTitle(sticker.name)
      .setImage(url)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `ID: ${sticker.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const SAPPHIRE = 0x0f52ba;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('emojiinfo')
    .setDescription('Display information about a custom emoji.')
    .addStringOption((o) =>
      o.setName('emoji').setDescription('The emoji to inspect (paste it here)').setRequired(true)
    ),

  async execute(interaction) {
    const input = interaction.options.getString('emoji', true);

    // Parse custom emoji: <a:name:id> or <:name:id>
    const match = input.match(/^<?(a?):(\w+):(\d+)>?$/);
    if (!match) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(SAPPHIRE).setDescription('Please provide a valid custom emoji (not a Unicode emoji).')],
        ephemeral: true,
      });
      return;
    }

    const [, animated, name, id] = match;
    const isAnimated = animated === 'a';
    const ext = isAnimated ? 'gif' : 'png';
    const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=256`;
    const urlWebp = `https://cdn.discordapp.com/emojis/${id}.webp?size=256`;

    // Try to find in guild cache
    const guildEmoji = interaction.guild.emojis.cache.get(id);
    const created = `<t:${Math.floor(BigInt(id) >> 22n) / 1000 + 1420070400 | 0}:F>`;

    const lines = [
      `> **Name:** ${name}`,
      `> **ID:** \`${id}\``,
      `> **Animated:** ${isAnimated ? 'Yes' : 'No'}`,
      `> **Created:** ${created}`,
      `> **Links:** [${ext.toUpperCase()}](${url}) · [WEBP](${urlWebp})`,
      guildEmoji ? `> **Available:** ${guildEmoji.available ? 'Yes' : 'No'}` : null,
      (guildEmoji && guildEmoji.roles.cache.size) ? `> **Restricted Roles:** ${guildEmoji.roles.cache.map((r) => r.toString()).join(', ')}` : null,
    ].filter(Boolean);

    const embed = new EmbedBuilder()
      .setColor(SAPPHIRE)
      .setTitle(`:${name}:`)
      .setThumbnail(url)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `ID: ${id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

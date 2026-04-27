const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  getConfig, economyEmbed, disabledEmbed, isChannelAllowed, RED, SAPPHIRE,
} = require('../../lib/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('View the server shop.'),
  async execute(interaction) {
    await interaction.deferReply();
    const cfg = await getConfig(interaction.guildId);
    if (!cfg.enabled) return interaction.editReply({ embeds: [disabledEmbed()] });
    if (!isChannelAllowed(cfg, interaction.channelId)) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Wrong Channel', 'Economy commands are restricted to specific channels.', RED)] });
    }

    const sym = cfg.currencySymbol || '💎';
    const name = cfg.currencyName || 'Flynn Coins';
    const items = (cfg.shop || []).filter((i) => i.active);

    if (!items.length) {
      return interaction.editReply({
        embeds: [economyEmbed(
          `${sym} Server Shop`,
          'The shop is currently empty. Server admins can add items via the dashboard!',
          SAPPHIRE
        )],
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`${sym} Server Shop`)
      .setColor(SAPPHIRE)
      .setDescription(`Browse items below. Use \`/buy <item name>\` to purchase.\n⸻`)
      .setTimestamp()
      .setFooter({ text: `FlynnBot Economy • Currency: ${name}` });

    for (const item of items.slice(0, 24)) {
      const stock = item.stock === -1 ? '∞' : item.stock.toLocaleString();
      embed.addFields({
        name: `${item.emoji} ${item.name}`,
        value: `**Price:** ${sym} ${item.price.toLocaleString()} ${name}\n**Stock:** ${stock}\n${item.description || ''}`,
        inline: true,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

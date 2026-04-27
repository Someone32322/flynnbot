const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed, GREEN, RED, SAPPHIRE,
} = require('../../lib/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sell')
    .setDescription('Sell an item from your inventory.')
    .addStringOption((opt) => opt.setName('item').setDescription('Item name to sell').setRequired(true))
    .addIntegerOption((opt) => opt.setName('quantity').setDescription('How many to sell').setRequired(false).setMinValue(1)),
  async execute(interaction) {
    await interaction.deferReply();
    const cfg = await getConfig(interaction.guildId);
    if (!cfg.enabled) return interaction.editReply({ embeds: [disabledEmbed()] });
    if (!isChannelAllowed(cfg, interaction.channelId)) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Wrong Channel', 'Economy commands are restricted to specific channels.', RED)] });
    }

    const sym = cfg.currencySymbol || '💎';
    const name = cfg.currencyName || 'Flynn Coins';
    const itemName = interaction.options.getString('item').toLowerCase();
    const qty = interaction.options.getInteger('quantity') ?? 1;

    const profile = await getProfile(interaction.guildId, interaction.user.id);
    const invIdx = profile.inventory.findIndex((i) => i.name.toLowerCase() === itemName);
    if (invIdx < 0) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Not in Inventory', `You don't have **${itemName}** in your inventory.`, RED)] });
    }

    const invItem = profile.inventory[invIdx];
    if (invItem.quantity < qty) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Not Enough', `You only have **${invItem.quantity}x ${invItem.name}**.`, RED)] });
    }

    // Find shop item for sell value (50% of price)
    const shopItem = (cfg.shop || []).find((i) => i.itemId === invItem.itemId);
    const sellPrice = shopItem ? Math.floor(shopItem.price * 0.5) : 10;
    const total = sellPrice * qty;

    invItem.quantity -= qty;
    if (invItem.quantity <= 0) {
      profile.inventory.splice(invIdx, 1);
    }
    profile.markModified('inventory');

    profile.wallet += total;
    profile.totalEarned = (profile.totalEarned || 0) + total;
    profile.netWorth = profile.wallet + profile.bank;
    await profile.save();

    const embed = economyEmbed('💰 Items Sold!', `You sold **${qty}x ${invItem.emoji} ${invItem.name}**!`, GREEN)
      .addFields(
        { name: '💰 Earned', value: `${sym} **${total.toLocaleString()}** ${name}`, inline: true },
        { name: '👝 New Wallet', value: `${sym} **${profile.wallet.toLocaleString()}** ${name}`, inline: true },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};

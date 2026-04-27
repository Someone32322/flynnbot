const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed, GREEN, RED, SAPPHIRE,
} = require('../../lib/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy an item from the server shop.')
    .addStringOption((opt) => opt.setName('item').setDescription('Item name to buy').setRequired(true))
    .addIntegerOption((opt) => opt.setName('quantity').setDescription('How many to buy').setRequired(false).setMinValue(1).setMaxValue(99)),
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

    const item = (cfg.shop || []).find((i) => i.active && i.name.toLowerCase() === itemName);
    if (!item) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Item Not Found', `No item named **${itemName}** found in the shop. Use \`/shop\` to browse.`, RED)] });
    }

    if (item.stock !== -1 && item.stock < qty) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Out of Stock', `Only **${item.stock}** left in stock.`, RED)] });
    }

    const total = item.price * qty;
    const profile = await getProfile(interaction.guildId, interaction.user.id);
    if (profile.wallet < total) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Insufficient Funds', `This costs **${sym} ${total.toLocaleString()}** but you only have **${sym} ${profile.wallet.toLocaleString()}**.`, RED)] });
    }

    // Deduct cost
    profile.wallet -= total;
    profile.totalSpent = (profile.totalSpent || 0) + total;
    profile.netWorth = profile.wallet + profile.bank;

    // Add to inventory
    const existingIdx = profile.inventory.findIndex((inv) => inv.itemId === item.itemId);
    if (existingIdx >= 0) {
      profile.inventory[existingIdx].quantity += qty;
    } else {
      profile.inventory.push({
        itemId: item.itemId,
        name: item.name,
        quantity: qty,
        type: item.type,
        emoji: item.emoji,
      });
    }
    profile.markModified('inventory');

    // Update stock in config if finite
    if (item.stock !== -1) {
      await require('../../../models/EconomyConfig').EconomyConfig.findOneAndUpdate(
        { guildId: interaction.guildId, 'shop.itemId': item.itemId },
        { $inc: { 'shop.$.stock': -qty, 'shop.$.soldCount': qty } }
      );
      require('../../lib/economy').invalidateConfigCache(interaction.guildId);
    }

    await profile.save();

    // Handle role reward
    if (item.type === 'role' && item.roleId) {
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (member) await member.roles.add(item.roleId).catch(() => null);
    }

    const embed = economyEmbed('🛒 Purchase Successful!', `You bought **${qty}x ${item.emoji} ${item.name}**!`, GREEN)
      .addFields(
        { name: '💸 Cost', value: `${sym} **${total.toLocaleString()}** ${name}`, inline: true },
        { name: '👝 Remaining', value: `${sym} **${profile.wallet.toLocaleString()}** ${name}`, inline: true },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};

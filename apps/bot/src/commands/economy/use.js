const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed, GREEN, RED, SAPPHIRE,
} = require('../../lib/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('use')
    .setDescription('Use an item from your inventory.')
    .addStringOption((opt) => opt.setName('item').setDescription('Item name to use').setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply();
    const cfg = await getConfig(interaction.guildId);
    if (!cfg.enabled) return interaction.editReply({ embeds: [disabledEmbed()] });
    if (!isChannelAllowed(cfg, interaction.channelId)) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Wrong Channel', 'Economy commands are restricted to specific channels.', RED)] });
    }

    const itemName = interaction.options.getString('item').toLowerCase();
    const profile = await getProfile(interaction.guildId, interaction.user.id);
    const invIdx = profile.inventory.findIndex((i) => i.name.toLowerCase() === itemName);

    if (invIdx < 0) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Not in Inventory', `You don't have **${itemName}** in your inventory.`, RED)] });
    }

    const invItem = profile.inventory[invIdx];
    const shopItem = (cfg.shop || []).find((s) => s.itemId === invItem.itemId);

    if (!shopItem?.usable) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Not Usable', `**${invItem.name}** cannot be used.`, RED)] });
    }

    // Apply effect
    let effectDesc = 'No effect.';
    const effect = shopItem.useEffect;
    const value = shopItem.useValue ?? 0;

    if (effect === 'wallet_boost') {
      profile.wallet += value;
      profile.totalEarned = (profile.totalEarned || 0) + value;
      effectDesc = `You received ${cfg.currencySymbol || '💎'} **${value.toLocaleString()}** ${cfg.currencyName || 'Flynn Coins'}!`;
    } else if (effect === 'bank_boost') {
      const space = profile.bankCap - profile.bank;
      const actual = Math.min(value, space);
      profile.bank += actual;
      effectDesc = `${actual > 0 ? `Added ${cfg.currencySymbol || '💎'} **${actual.toLocaleString()}** to your bank!` : 'Your bank is full.'}`;
    } else {
      effectDesc = `You used **${invItem.emoji} ${invItem.name}**. Something happened...`;
    }

    // Remove one from inventory
    invItem.quantity -= 1;
    if (invItem.quantity <= 0) profile.inventory.splice(invIdx, 1);
    profile.markModified('inventory');
    profile.netWorth = profile.wallet + profile.bank;
    await profile.save();

    const embed = economyEmbed(`✨ Used ${invItem.emoji} ${invItem.name}`, effectDesc, GREEN);
    await interaction.editReply({ embeds: [embed] });
  },
};

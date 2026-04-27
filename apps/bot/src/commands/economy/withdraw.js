const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed, GREEN, RED, SAPPHIRE,
} = require('../../lib/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('Withdraw coins from your bank to your wallet.')
    .addStringOption((opt) =>
      opt.setName('amount').setDescription('Amount to withdraw (or "all")').setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply();
    const cfg = await getConfig(interaction.guildId);
    if (!cfg.enabled) return interaction.editReply({ embeds: [disabledEmbed()] });
    if (!isChannelAllowed(cfg, interaction.channelId)) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Wrong Channel', 'Economy commands are restricted to specific channels.', RED)] });
    }

    const sym = cfg.currencySymbol || '💎';
    const name = cfg.currencyName || 'Flynn Coins';
    const profile = await getProfile(interaction.guildId, interaction.user.id);
    const raw = interaction.options.getString('amount');
    let amount;

    if (raw.toLowerCase() === 'all' || raw.toLowerCase() === 'max') {
      amount = profile.bank;
    } else {
      amount = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    }

    if (isNaN(amount) || amount <= 0) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Invalid Amount', 'Please provide a valid positive amount.', RED)] });
    }
    if (amount > profile.bank) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Insufficient Funds', `You only have **${sym} ${profile.bank.toLocaleString()}** in your bank.`, RED)] });
    }

    profile.bank -= amount;
    profile.wallet += amount;
    profile.netWorth = profile.wallet + profile.bank;
    await profile.save();

    const embed = economyEmbed('💳 Withdrawal Successful', null, SAPPHIRE)
      .addFields(
        { name: '💰 Withdrawn', value: `${sym} **${amount.toLocaleString()}** ${name}`, inline: true },
        { name: '👝 Wallet', value: `${sym} **${profile.wallet.toLocaleString()}** ${name}`, inline: true },
        { name: '🏦 Bank', value: `${sym} **${profile.bank.toLocaleString()}** / ${profile.bankCap.toLocaleString()} ${name}`, inline: true },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};

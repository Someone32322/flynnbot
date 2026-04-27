const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed, GREEN, RED, SAPPHIRE,
} = require('../../lib/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deposit')
    .setDescription('Deposit coins from your wallet to your bank.')
    .addStringOption((opt) =>
      opt.setName('amount').setDescription('Amount to deposit (or "all")').setRequired(true)
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
      amount = profile.wallet;
    } else {
      amount = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    }

    if (isNaN(amount) || amount <= 0) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Invalid Amount', 'Please provide a valid positive amount.', RED)] });
    }
    if (amount > profile.wallet) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Insufficient Funds', `You only have **${sym} ${profile.wallet.toLocaleString()}** in your wallet.`, RED)] });
    }

    const space = profile.bankCap - profile.bank;
    if (space <= 0) {
      return interaction.editReply({ embeds: [economyEmbed('🏦 Bank Full', `Your bank is full! Maximum capacity: **${sym} ${profile.bankCap.toLocaleString()}**.`, RED)] });
    }

    const deposited = Math.min(amount, space);
    profile.wallet -= deposited;
    profile.bank += deposited;
    profile.netWorth = profile.wallet + profile.bank;
    await profile.save();

    const embed = economyEmbed('🏦 Deposit Successful', null, SAPPHIRE)
      .addFields(
        { name: '💰 Deposited', value: `${sym} **${deposited.toLocaleString()}** ${name}`, inline: true },
        { name: '👝 Wallet', value: `${sym} **${profile.wallet.toLocaleString()}** ${name}`, inline: true },
        { name: '🏦 Bank', value: `${sym} **${profile.bank.toLocaleString()}** / ${profile.bankCap.toLocaleString()} ${name}`, inline: true },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};

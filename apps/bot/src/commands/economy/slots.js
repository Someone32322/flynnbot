const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed, GREEN, RED, GOLD,
} = require('../../lib/economy');

const SLOTS = ['🍒', '🍋', '🍇', '⭐', '💎', '🔔', '🍀'];

function spinSlots() {
  return [
    SLOTS[Math.floor(Math.random() * SLOTS.length)],
    SLOTS[Math.floor(Math.random() * SLOTS.length)],
    SLOTS[Math.floor(Math.random() * SLOTS.length)],
  ];
}

function getMultiplier(reels) {
  const [a, b, c] = reels;
  if (a === b && b === c) {
    if (a === '💎') return 10;
    if (a === '🍀') return 7;
    if (a === '⭐') return 5;
    return 3;
  }
  if (a === b || b === c || a === c) return 1.5;
  return 0;
}

function parseBet(raw, wallet, min, max) {
  const str = raw.toLowerCase().trim();
  if (str === 'all' || str === 'max') return Math.min(wallet, max);
  if (str === 'half') return Math.min(Math.floor(wallet / 2), max);
  const n = parseInt(str.replace(/[^0-9]/g, ''), 10);
  if (isNaN(n)) return null;
  return n;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Spin the slot machine and win big — or lose it all.')
    .addStringOption((opt) => opt.setName('bet').setDescription('Amount to bet (number, "all", or "half")').setRequired(true)),
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
    const minBet = cfg.minBet ?? 10;
    const maxBet = cfg.maxBet ?? 50000;

    const bet = parseBet(interaction.options.getString('bet'), profile.wallet, minBet, maxBet);
    if (bet === null || isNaN(bet)) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Invalid Bet', 'Enter a valid number, "all", or "half".', RED)] });
    }
    if (bet < minBet) return interaction.editReply({ embeds: [economyEmbed('❌ Bet Too Small', `Minimum bet is ${sym} **${minBet.toLocaleString()}**.`, RED)] });
    if (bet > maxBet) return interaction.editReply({ embeds: [economyEmbed('❌ Bet Too High', `Maximum bet is ${sym} **${maxBet.toLocaleString()}**.`, RED)] });
    if (bet > profile.wallet) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Insufficient Funds', `You only have ${sym} **${profile.wallet.toLocaleString()}** in your wallet.`, RED)] });
    }

    const reels = spinSlots();
    const multiplier = getMultiplier(reels);
    const won = multiplier > 0;
    const payout = Math.floor(bet * multiplier);
    const net = won ? payout - bet : -bet;

    profile.wallet = Math.max(0, profile.wallet + net);
    profile.totalGambled = (profile.totalGambled || 0) + bet;
    if (won) {
      profile.totalWon = (profile.totalWon || 0) + payout;
    } else {
      profile.totalLost = (profile.totalLost || 0) + bet;
    }
    profile.netWorth = profile.wallet + profile.bank;
    await profile.save();

    const display = reels.join(' | ');
    let result, color;
    if (multiplier >= 3) {
      result = `🎉 **JACKPOT!** You won **${multiplier}x** your bet!`;
      color = GOLD;
    } else if (won) {
      result = `✅ You matched 2! You won **${multiplier}x** your bet.`;
      color = GREEN;
    } else {
      result = `❌ No match. You lost your bet.`;
      color = RED;
    }

    const embed = economyEmbed('🎰 Slot Machine', `**[ ${display} ]**\n\n${result}`, color)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '🎲 Bet', value: `${sym} **${bet.toLocaleString()}** ${name}`, inline: true },
        { name: won ? '🏆 Won' : '💸 Lost', value: `${sym} **${Math.abs(net).toLocaleString()}** ${name}`, inline: true },
        { name: '👝 Wallet', value: `${sym} **${profile.wallet.toLocaleString()}** ${name}`, inline: true },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};

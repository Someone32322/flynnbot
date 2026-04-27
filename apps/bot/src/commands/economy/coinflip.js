const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed, GREEN, RED, GOLD,
} = require('../../lib/economy');

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
    .setName('coinflip')
    .setDescription('Flip a coin and bet on the outcome.')
    .addStringOption((opt) => opt.setName('bet').setDescription('Amount to bet (number, "all", or "half")').setRequired(true))
    .addStringOption((opt) =>
      opt.setName('side').setDescription('heads or tails').setRequired(false)
        .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })
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

    const chosen = interaction.options.getString('side') || (Math.random() < 0.5 ? 'heads' : 'tails');
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = chosen === result;
    const coinEmoji = result === 'heads' ? '🪙' : '🟡';

    if (won) {
      profile.wallet += bet;
      profile.totalGambled = (profile.totalGambled || 0) + bet;
      profile.totalWon = (profile.totalWon || 0) + bet;
    } else {
      profile.wallet = Math.max(0, profile.wallet - bet);
      profile.totalGambled = (profile.totalGambled || 0) + bet;
      profile.totalLost = (profile.totalLost || 0) + bet;
    }
    profile.netWorth = profile.wallet + profile.bank;
    await profile.save();

    const embed = economyEmbed(
      `🪙 Coin Flip — ${coinEmoji} ${result.charAt(0).toUpperCase() + result.slice(1)}!`,
      won ? `You called **${chosen}** and it landed on **${result}** — you win! 🎉` : `You called **${chosen}** but it landed on **${result}** — you lose.`,
      won ? (bet > 5000 ? GOLD : GREEN) : RED
    )
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '🎲 Bet', value: `${sym} **${bet.toLocaleString()}** ${name}`, inline: true },
        { name: won ? '🏆 Won' : '💸 Lost', value: `${sym} **${bet.toLocaleString()}** ${name}`, inline: true },
        { name: '👝 Wallet', value: `${sym} **${profile.wallet.toLocaleString()}** ${name}`, inline: true },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed, GREEN, RED, GOLD,
} = require('../../lib/economy');

// ── Card helpers ─────────────────────────────────────────────

const SUITS = ['♠', '♣', '♥', '♦'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function makeDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s });
  return shuffle(deck);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardValue(card) {
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  if (card.rank === 'A') return 11;
  return parseInt(card.rank, 10);
}

function handTotal(hand) {
  let total = hand.reduce((s, c) => s + cardValue(c), 0);
  let aces = hand.filter((c) => c.rank === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function formatHand(hand, hideSecond = false) {
  return hand.map((c, i) => (hideSecond && i === 1) ? '🂠' : `**${c.rank}${c.suit}**`).join('  ');
}

function isBlackjack(hand) {
  return hand.length === 2 && handTotal(hand) === 21;
}

function parseBet(raw, wallet, min, max) {
  const str = String(raw).toLowerCase().trim();
  if (str === 'all' || str === 'max') return Math.min(wallet, max);
  if (str === 'half') return Math.min(Math.floor(wallet / 2), max);
  const n = parseInt(str.replace(/[^0-9]/g, ''), 10);
  if (isNaN(n)) return null;
  return n;
}

// Active games map: interactionId → gameState
const activeGames = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Play a round of blackjack against the dealer.')
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

    // Deduct bet immediately
    profile.wallet -= bet;
    profile.totalGambled = (profile.totalGambled || 0) + bet;
    profile.netWorth = profile.wallet + profile.bank;
    await profile.save();

    const deck = makeDeck();
    const playerHand = [deck.pop(), deck.pop()];
    const dealerHand = [deck.pop(), deck.pop()];

    const gameId = `bj_${interaction.user.id}_${Date.now()}`;

    // Check for player blackjack
    if (isBlackjack(playerHand)) {
      const payout = Math.floor(bet * 2.5); // 3:2 payout
      profile.wallet += payout;
      profile.totalWon = (profile.totalWon || 0) + payout;
      profile.netWorth = profile.wallet + profile.bank;
      await profile.save();

      const embed = economyEmbed('🃏 Blackjack!', `You got a natural blackjack! 🎉`, GOLD)
        .addFields(
          { name: '🎴 Your Hand', value: `${formatHand(playerHand)} (21)`, inline: false },
          { name: '🃏 Dealer Hand', value: `${formatHand(dealerHand)} (${handTotal(dealerHand)})`, inline: false },
          { name: '🏆 Winnings', value: `${sym} **${payout.toLocaleString()}** ${name} (3:2 payout)`, inline: true },
          { name: '👝 Wallet', value: `${sym} **${profile.wallet.toLocaleString()}** ${name}`, inline: true },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    const playerTotal = handTotal(playerHand);
    const embed = economyEmbed('🃏 Blackjack', `Your bet: ${sym} **${bet.toLocaleString()}** ${name}`, 0x0f52ba)
      .addFields(
        { name: '🎴 Your Hand', value: `${formatHand(playerHand)} (${playerTotal})`, inline: false },
        { name: '🃏 Dealer Hand', value: `${formatHand(dealerHand, true)} (${cardValue(dealerHand[0])} + ?)`, inline: false },
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${gameId}:hit`).setLabel('Hit').setStyle(ButtonStyle.Primary).setEmoji('🃏'),
      new ButtonBuilder().setCustomId(`${gameId}:stand`).setLabel('Stand').setStyle(ButtonStyle.Secondary).setEmoji('🛑'),
      new ButtonBuilder().setCustomId(`${gameId}:double`).setLabel('Double Down').setStyle(ButtonStyle.Success).setEmoji('💰').setDisabled(profile.wallet < bet),
    );

    activeGames.set(gameId, {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      bet,
      deck,
      playerHand,
      dealerHand,
      sym,
      name,
      cfg,
    });

    const reply = await interaction.editReply({ embeds: [embed], components: [row] });

    // Collector for button interactions
    const filter = (i) => i.user.id === interaction.user.id && i.customId.startsWith(gameId);
    const collector = reply.createMessageComponentCollector({ filter, time: 60_000, max: 20 });

    collector.on('collect', async (btn) => {
      const game = activeGames.get(gameId);
      if (!game) return;

      const action = btn.customId.split(':')[2];
      await btn.deferUpdate();

      if (action === 'hit') {
        game.playerHand.push(game.deck.pop());
        const newTotal = handTotal(game.playerHand);

        if (newTotal > 21) {
          // Bust
          activeGames.delete(gameId);
          collector.stop();
          const p = await getProfile(game.guildId, game.userId);
          p.totalLost = (p.totalLost || 0) + game.bet;
          p.netWorth = p.wallet + p.bank;
          await p.save();

          const bustEmbed = economyEmbed('🃏 Bust!', `You went over 21!`, RED)
            .addFields(
              { name: '🎴 Your Hand', value: `${formatHand(game.playerHand)} (${newTotal})`, inline: false },
              { name: '🃏 Dealer Hand', value: `${formatHand(game.dealerHand)} (${handTotal(game.dealerHand)})`, inline: false },
              { name: '💸 Lost', value: `${sym} **${game.bet.toLocaleString()}** ${game.name}`, inline: true },
              { name: '👝 Wallet', value: `${sym} **${p.wallet.toLocaleString()}** ${game.name}`, inline: true },
            );
          return btn.editReply({ embeds: [bustEmbed], components: [] });
        }

        const updatedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`${gameId}:hit`).setLabel('Hit').setStyle(ButtonStyle.Primary).setEmoji('🃏'),
          new ButtonBuilder().setCustomId(`${gameId}:stand`).setLabel('Stand').setStyle(ButtonStyle.Secondary).setEmoji('🛑'),
          new ButtonBuilder().setCustomId(`${gameId}:double`).setLabel('Double Down').setStyle(ButtonStyle.Success).setEmoji('💰').setDisabled(true),
        );
        const updatedEmbed = economyEmbed('🃏 Blackjack', `Your bet: ${sym} **${game.bet.toLocaleString()}** ${game.name}`, 0x0f52ba)
          .addFields(
            { name: '🎴 Your Hand', value: `${formatHand(game.playerHand)} (${newTotal})`, inline: false },
            { name: '🃏 Dealer Hand', value: `${formatHand(game.dealerHand, true)} (${cardValue(game.dealerHand[0])} + ?)`, inline: false },
          );
        return btn.editReply({ embeds: [updatedEmbed], components: [updatedRow] });
      }

      if (action === 'double') {
        const p = await getProfile(game.guildId, game.userId);
        if (p.wallet < game.bet) {
          return; // Can't double
        }
        p.wallet -= game.bet;
        p.totalGambled = (p.totalGambled || 0) + game.bet;
        game.bet *= 2;
        await p.save();
        game.playerHand.push(game.deck.pop());
      }

      // STAND or forced stop after double
      const playerFinal = handTotal(game.playerHand);
      // Dealer hits until 17+
      while (handTotal(game.dealerHand) < 17) {
        game.dealerHand.push(game.deck.pop());
      }
      const dealerFinal = handTotal(game.dealerHand);

      activeGames.delete(gameId);
      collector.stop();

      const p = await getProfile(game.guildId, game.userId);
      let resultText, color, payout = 0;

      if (playerFinal > 21) {
        resultText = 'You busted! Dealer wins.';
        color = RED;
        p.totalLost = (p.totalLost || 0) + game.bet;
      } else if (dealerFinal > 21 || playerFinal > dealerFinal) {
        payout = game.bet * 2;
        resultText = `You win! 🎉`;
        color = GREEN;
        p.wallet += payout;
        p.totalWon = (p.totalWon || 0) + payout;
      } else if (playerFinal === dealerFinal) {
        payout = game.bet;
        resultText = 'Push! Your bet is returned.';
        color = 0xf59e0b;
        p.wallet += payout;
      } else {
        resultText = 'Dealer wins.';
        color = RED;
        p.totalLost = (p.totalLost || 0) + game.bet;
      }

      p.netWorth = p.wallet + p.bank;
      await p.save();

      const finalEmbed = economyEmbed('🃏 Blackjack Result', resultText, color)
        .addFields(
          { name: '🎴 Your Hand', value: `${formatHand(game.playerHand)} (${playerFinal})`, inline: false },
          { name: '🃏 Dealer Hand', value: `${formatHand(game.dealerHand)} (${dealerFinal})`, inline: false },
          payout > 0
            ? { name: '🏆 Payout', value: `${sym} **${payout.toLocaleString()}** ${game.name}`, inline: true }
            : { name: '💸 Lost', value: `${sym} **${game.bet.toLocaleString()}** ${game.name}`, inline: true },
          { name: '👝 Wallet', value: `${sym} **${p.wallet.toLocaleString()}** ${game.name}`, inline: true },
        );
      return btn.editReply({ embeds: [finalEmbed], components: [] });
    });

    collector.on('end', async (_, reason) => {
      if (reason === 'time' && activeGames.has(gameId)) {
        activeGames.delete(gameId);
        // Auto-stand on timeout
        try {
          await interaction.editReply({ embeds: [economyEmbed('⏱️ Game Expired', 'Your blackjack game expired (60s timeout). Your bet was lost.', RED)], components: [] });
        } catch (_) {}
      }
    });
  },
};

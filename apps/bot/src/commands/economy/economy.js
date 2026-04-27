const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed, SAPPHIRE, GOLD,
} = require('../../lib/economy');
const { EconomyProfile } = require('../../models/EconomyProfile');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('economy')
    .setDescription('Economy leaderboard and stats.')
    .addSubcommand((sub) =>
      sub.setName('leaderboard').setDescription('View the economy leaderboard.').addIntegerOption((opt) =>
        opt.setName('page').setDescription('Page number').setRequired(false).setMinValue(1)
      )
    )
    .addSubcommand((sub) =>
      sub.setName('stats').setDescription('View your economy statistics.')
        .addUserOption((opt) => opt.setName('user').setDescription('View another user').setRequired(false))
    ),
  async execute(interaction) {
    await interaction.deferReply();
    const cfg = await getConfig(interaction.guildId);
    if (!cfg.enabled) return interaction.editReply({ embeds: [disabledEmbed()] });
    if (!isChannelAllowed(cfg, interaction.channelId)) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Wrong Channel', 'Economy commands are restricted to specific channels.', 0xe74c3c)] });
    }

    const sub = interaction.options.getSubcommand();
    const sym = cfg.currencySymbol || '💎';
    const name = cfg.currencyName || 'Flynn Coins';

    if (sub === 'leaderboard') {
      const page = (interaction.options.getInteger('page') ?? 1) - 1;
      const limit = 10;
      const skip = page * limit;

      const total = await EconomyProfile.countDocuments({ guildId: interaction.guildId });
      const profiles = await EconomyProfile.find({ guildId: interaction.guildId })
        .sort({ wallet: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      if (!profiles.length) {
        return interaction.editReply({ embeds: [economyEmbed(`${sym} Economy Leaderboard`, 'No economy data yet. Start earning coins!', SAPPHIRE)] });
      }

      const medals = ['🥇', '🥈', '🥉'];
      const lines = await Promise.all(profiles.map(async (p, i) => {
        let username;
        try {
          const member = await interaction.guild.members.fetch(p.userId);
          username = member.displayName;
        } catch {
          username = `User ${p.userId.slice(-4)}`;
        }
        const rank = skip + i + 1;
        const medal = medals[skip + i] || `**#${rank}**`;
        return `${medal} **${username}** — ${sym} ${(p.wallet + p.bank).toLocaleString()}`;
      }));

      const totalPages = Math.ceil(total / limit);
      const embed = new EmbedBuilder()
        .setTitle(`${sym} Economy Leaderboard`)
        .setDescription(lines.join('\n'))
        .setColor(GOLD)
        .setFooter({ text: `Page ${page + 1}/${totalPages} • Net worth (wallet + bank) • FlynnBot Economy` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'stats') {
      const target = interaction.options.getUser('user') || interaction.user;
      const profile = await getProfile(interaction.guildId, target.id);
      const embed = economyEmbed(`📊 ${target.username}'s Economy Stats`, null, SAPPHIRE)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👝 Wallet', value: `${sym} **${profile.wallet.toLocaleString()}**`, inline: true },
          { name: '🏦 Bank', value: `${sym} **${profile.bank.toLocaleString()}** / ${profile.bankCap.toLocaleString()}`, inline: true },
          { name: '💰 Net Worth', value: `${sym} **${(profile.wallet + profile.bank).toLocaleString()}**`, inline: true },
          { name: '📈 Total Earned', value: `${sym} **${(profile.totalEarned || 0).toLocaleString()}**`, inline: true },
          { name: '📉 Total Spent', value: `${sym} **${(profile.totalSpent || 0).toLocaleString()}**`, inline: true },
          { name: '🎲 Total Gambled', value: `${sym} **${(profile.totalGambled || 0).toLocaleString()}**`, inline: true },
          { name: '🏆 Total Won', value: `${sym} **${(profile.totalWon || 0).toLocaleString()}**`, inline: true },
          { name: '💸 Total Lost', value: `${sym} **${(profile.totalLost || 0).toLocaleString()}**`, inline: true },
          { name: '🔥 Daily Streak', value: `**${profile.streak || 0}** days`, inline: true },
        );
      return interaction.editReply({ embeds: [embed] });
    }
  },
};

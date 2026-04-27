const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed,
  checkCooldown, formatCoins, GOLD, RED,
} = require('../../lib/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Collect your daily reward.'),
  async execute(interaction) {
    await interaction.deferReply();
    const cfg = await getConfig(interaction.guildId);
    if (!cfg.enabled) return interaction.editReply({ embeds: [disabledEmbed()] });
    if (!isChannelAllowed(cfg, interaction.channelId)) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Wrong Channel', 'Economy commands are restricted to specific channels.', RED)] });
    }

    const profile = await getProfile(interaction.guildId, interaction.user.id);
    const cooldownMs = (cfg.dailyCooldownHours ?? 22) * 3_600_000;
    const cd = checkCooldown(profile.lastDaily, cooldownMs);
    if (!cd.ready) {
      return interaction.editReply({
        embeds: [economyEmbed('⏱️ Daily Already Collected', `Your daily reward resets in **${require('../../lib/economy').msToHuman(cd.remaining)}**.`, RED)],
      });
    }

    const sym = cfg.currencySymbol || '💎';
    const name = cfg.currencyName || 'Flynn Coins';
    const amount = cfg.dailyAmount ?? 250;

    // Streak logic
    const now = new Date();
    const lastDate = profile.lastStreakDate ? new Date(profile.lastStreakDate) : null;
    let streak = profile.streak || 0;
    if (lastDate) {
      const hoursSince = (now - lastDate) / 3_600_000;
      if (hoursSince < 48) {
        streak += 1;
      } else {
        streak = 1;
      }
    } else {
      streak = 1;
    }
    const bonus = Math.floor(amount * Math.min(streak - 1, 30) * 0.02); // up to +60% at 30-day streak
    const total = amount + bonus;

    profile.wallet += total;
    profile.totalEarned = (profile.totalEarned || 0) + total;
    profile.netWorth = profile.wallet + profile.bank;
    profile.lastDaily = now;
    profile.streak = streak;
    profile.lastStreakDate = now;
    await profile.save();

    const embed = economyEmbed(
      `${sym} Daily Reward`,
      `You collected your daily reward!`,
      GOLD
    )
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '💰 Reward', value: `${sym} **${amount.toLocaleString()}** ${name}`, inline: true },
        bonus > 0
          ? { name: '🔥 Streak Bonus', value: `+${sym} **${bonus.toLocaleString()}** (Day ${streak} streak!)`, inline: true }
          : { name: '🔥 Streak', value: `Day **${streak}** — keep it going!`, inline: true },
        { name: '👝 New Wallet', value: `${sym} **${profile.wallet.toLocaleString()}** ${name}`, inline: false },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};

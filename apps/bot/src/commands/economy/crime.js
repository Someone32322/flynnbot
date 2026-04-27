const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed,
  checkCooldown, msToHuman, CRIME_EVENTS, GREEN, RED,
} = require('../../lib/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crime')
    .setDescription('Attempt a crime for a risky reward.'),
  async execute(interaction) {
    await interaction.deferReply();
    const cfg = await getConfig(interaction.guildId);
    if (!cfg.enabled) return interaction.editReply({ embeds: [disabledEmbed()] });
    if (!isChannelAllowed(cfg, interaction.channelId)) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Wrong Channel', 'Economy commands are restricted to specific channels.', RED)] });
    }

    const profile = await getProfile(interaction.guildId, interaction.user.id);
    const cooldownMs = (cfg.crimeCooldownMinutes ?? 90) * 60_000;
    const cd = checkCooldown(profile.lastCrime, cooldownMs);
    if (!cd.ready) {
      return interaction.editReply({
        embeds: [economyEmbed('⏱️ Laying Low', `You need to lay low for **${msToHuman(cd.remaining)}** before another crime.`, RED)],
      });
    }

    const sym = cfg.currencySymbol || '💎';
    const name = cfg.currencyName || 'Flynn Coins';
    const event = CRIME_EVENTS[Math.floor(Math.random() * CRIME_EVENTS.length)];
    const successRate = cfg.crimeSuccessRate ?? 60;
    const success = Math.random() * 100 < successRate;

    profile.lastCrime = new Date();

    if (success) {
      const min = cfg.crimeMin ?? 200;
      const max = cfg.crimeMax ?? 800;
      const earned = Math.floor(Math.random() * (max - min + 1)) + min;
      profile.wallet += earned;
      profile.totalEarned = (profile.totalEarned || 0) + earned;
      profile.netWorth = profile.wallet + profile.bank;
      await profile.save();

      const embed = economyEmbed('🦹 Crime Successful', event.msg + '!', GREEN)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '💰 Stolen', value: `${sym} **${earned.toLocaleString()}** ${name}`, inline: true },
          { name: '👝 New Wallet', value: `${sym} **${profile.wallet.toLocaleString()}** ${name}`, inline: true },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    // Failed — pay a fine
    const fineMin = cfg.crimeFineMin ?? 100;
    const fineMax = cfg.crimeFineMax ?? 400;
    const fine = Math.min(profile.wallet, Math.floor(Math.random() * (fineMax - fineMin + 1)) + fineMin);
    profile.wallet = Math.max(0, profile.wallet - fine);
    profile.totalSpent = (profile.totalSpent || 0) + fine;
    profile.netWorth = profile.wallet + profile.bank;
    await profile.save();

    const embed = economyEmbed('🚔 Crime Failed!', event.failMsg, RED)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '💸 Fine Paid', value: `${sym} **${fine.toLocaleString()}** ${name}`, inline: true },
        { name: '👝 New Wallet', value: `${sym} **${profile.wallet.toLocaleString()}** ${name}`, inline: true },
      );
    return interaction.editReply({ embeds: [embed] });
  },
};

const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed,
  checkCooldown, msToHuman, WORK_JOBS, GREEN, RED,
} = require('../../lib/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Work a job to earn coins.'),
  async execute(interaction) {
    await interaction.deferReply();
    const cfg = await getConfig(interaction.guildId);
    if (!cfg.enabled) return interaction.editReply({ embeds: [disabledEmbed()] });
    if (!isChannelAllowed(cfg, interaction.channelId)) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Wrong Channel', 'Economy commands are restricted to specific channels.', RED)] });
    }

    const profile = await getProfile(interaction.guildId, interaction.user.id);
    const cooldownMs = (cfg.workCooldownMinutes ?? 60) * 60_000;
    const cd = checkCooldown(profile.lastWork, cooldownMs);
    if (!cd.ready) {
      return interaction.editReply({
        embeds: [economyEmbed('⏱️ Already Worked', `You can work again in **${msToHuman(cd.remaining)}**.`, RED)],
      });
    }

    const sym = cfg.currencySymbol || '💎';
    const name = cfg.currencyName || 'Flynn Coins';
    const min = cfg.workMin ?? 100;
    const max = cfg.workMax ?? 400;
    const earned = Math.floor(Math.random() * (max - min + 1)) + min;
    const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];

    profile.wallet += earned;
    profile.totalEarned = (profile.totalEarned || 0) + earned;
    profile.netWorth = profile.wallet + profile.bank;
    profile.lastWork = new Date();
    await profile.save();

    const embed = economyEmbed(
      `💼 Work — ${job.name}`,
      `${job.msg} and earned ${sym} **${earned.toLocaleString()}** ${name}!`,
      GREEN
    )
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '💰 Earned', value: `${sym} **${earned.toLocaleString()}** ${name}`, inline: true },
        { name: '👝 New Wallet', value: `${sym} **${profile.wallet.toLocaleString()}** ${name}`, inline: true },
        { name: '⏰ Next Work', value: `**${msToHuman(cooldownMs)}**`, inline: false },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};

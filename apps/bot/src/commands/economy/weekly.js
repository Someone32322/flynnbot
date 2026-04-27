const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed,
  checkCooldown, msToHuman, GOLD, RED,
} = require('../../lib/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('weekly')
    .setDescription('Collect your weekly reward.'),
  async execute(interaction) {
    await interaction.deferReply();
    const cfg = await getConfig(interaction.guildId);
    if (!cfg.enabled) return interaction.editReply({ embeds: [disabledEmbed()] });
    if (!isChannelAllowed(cfg, interaction.channelId)) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Wrong Channel', 'Economy commands are restricted to specific channels.', RED)] });
    }

    const profile = await getProfile(interaction.guildId, interaction.user.id);
    const cooldownMs = (cfg.weeklyCooldownDays ?? 7) * 86_400_000;
    const cd = checkCooldown(profile.lastWeekly, cooldownMs);
    if (!cd.ready) {
      return interaction.editReply({
        embeds: [economyEmbed('⏱️ Weekly Already Collected', `Your weekly reward resets in **${msToHuman(cd.remaining)}**.`, RED)],
      });
    }

    const sym = cfg.currencySymbol || '💎';
    const name = cfg.currencyName || 'Flynn Coins';
    const amount = cfg.weeklyAmount ?? 1500;

    profile.wallet += amount;
    profile.totalEarned = (profile.totalEarned || 0) + amount;
    profile.netWorth = profile.wallet + profile.bank;
    profile.lastWeekly = new Date();
    await profile.save();

    const embed = economyEmbed(
      `${sym} Weekly Reward`,
      `You collected your weekly reward!`,
      GOLD
    )
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '💰 Reward', value: `${sym} **${amount.toLocaleString()}** ${name}`, inline: true },
        { name: '👝 New Wallet', value: `${sym} **${profile.wallet.toLocaleString()}** ${name}`, inline: false },
        { name: '⏰ Next Weekly', value: `Come back in **7 days**!`, inline: false },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};

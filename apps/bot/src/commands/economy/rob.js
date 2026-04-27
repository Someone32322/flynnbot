const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed,
  checkCooldown, msToHuman, GREEN, RED,
} = require('../../lib/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Attempt to rob another user\'s wallet.')
    .addUserOption((opt) => opt.setName('user').setDescription('Who to rob').setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply();
    const cfg = await getConfig(interaction.guildId);
    if (!cfg.enabled) return interaction.editReply({ embeds: [disabledEmbed()] });
    if (!isChannelAllowed(cfg, interaction.channelId)) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Wrong Channel', 'Economy commands are restricted to specific channels.', RED)] });
    }

    const target = interaction.options.getUser('user');
    if (target.id === interaction.user.id) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Rob Yourself?', 'You can\'t rob yourself.', RED)] });
    }
    if (target.bot) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Nice Try', 'You can\'t rob a bot.', RED)] });
    }

    const profile = await getProfile(interaction.guildId, interaction.user.id);
    const cooldownMs = (cfg.robCooldownMinutes ?? 300) * 60_000;
    const cd = checkCooldown(profile.lastRob, cooldownMs);
    if (!cd.ready) {
      return interaction.editReply({
        embeds: [economyEmbed('⏱️ Heat is On', `You need to wait **${msToHuman(cd.remaining)}** before robbing again.`, RED)],
      });
    }

    const sym = cfg.currencySymbol || '💎';
    const name = cfg.currencyName || 'Flynn Coins';
    const targetProfile = await getProfile(interaction.guildId, target.id);

    if (targetProfile.wallet < 100) {
      return interaction.editReply({
        embeds: [economyEmbed('🫙 Not Worth It', `${target.username} is flat broke — not worth the risk!`, RED)],
      });
    }

    profile.lastRob = new Date();
    const successRate = cfg.robSuccessRate ?? 40;
    const success = Math.random() * 100 < successRate;

    if (success) {
      const minPct = cfg.robMin ?? 5;
      const maxPct = cfg.robMax ?? 20;
      const pct = Math.floor(Math.random() * (maxPct - minPct + 1)) + minPct;
      const stolen = Math.floor(targetProfile.wallet * (pct / 100));

      targetProfile.wallet = Math.max(0, targetProfile.wallet - stolen);
      targetProfile.netWorth = targetProfile.wallet + targetProfile.bank;
      profile.wallet += stolen;
      profile.totalEarned = (profile.totalEarned || 0) + stolen;
      profile.netWorth = profile.wallet + profile.bank;

      await Promise.all([profile.save(), targetProfile.save()]);

      const embed = economyEmbed(
        '🦹 Robbery Successful!',
        `You successfully robbed **${target.username}** and got away with **${pct}%** of their wallet!`,
        GREEN
      )
        .addFields(
          { name: '💰 Stolen', value: `${sym} **${stolen.toLocaleString()}** ${name}`, inline: true },
          { name: '👝 Your Wallet', value: `${sym} **${profile.wallet.toLocaleString()}** ${name}`, inline: true },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    // Failed — pay a fine from wallet
    const fine = Math.min(profile.wallet, Math.floor(targetProfile.wallet * 0.1));
    profile.wallet = Math.max(0, profile.wallet - fine);
    profile.totalSpent = (profile.totalSpent || 0) + fine;
    profile.netWorth = profile.wallet + profile.bank;
    await profile.save();

    const embed = economyEmbed(
      '🚔 Caught Red-Handed!',
      `You tried to rob **${target.username}** but got caught! You paid a fine of **${sym} ${fine.toLocaleString()}**.`,
      RED
    )
      .addFields(
        { name: '💸 Fine Paid', value: `${sym} **${fine.toLocaleString()}** ${name}`, inline: true },
        { name: '👝 Your Wallet', value: `${sym} **${profile.wallet.toLocaleString()}** ${name}`, inline: true },
      );
    return interaction.editReply({ embeds: [embed] });
  },
};

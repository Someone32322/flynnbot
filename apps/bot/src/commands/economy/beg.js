const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed,
  checkCooldown, msToHuman, BEG_MESSAGES, BEG_GIVERS, GREEN, RED,
} = require('../../lib/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('beg')
    .setDescription('Beg for a small amount of coins.'),
  async execute(interaction) {
    await interaction.deferReply();
    const cfg = await getConfig(interaction.guildId);
    if (!cfg.enabled) return interaction.editReply({ embeds: [disabledEmbed()] });
    if (!isChannelAllowed(cfg, interaction.channelId)) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Wrong Channel', 'Economy commands are restricted to specific channels.', RED)] });
    }

    const profile = await getProfile(interaction.guildId, interaction.user.id);
    const cooldownMs = (cfg.begCooldownMinutes ?? 30) * 60_000;
    const cd = checkCooldown(profile.lastBeg, cooldownMs);
    if (!cd.ready) {
      return interaction.editReply({
        embeds: [economyEmbed('⏱️ Not So Fast', `Stop begging so much! Wait **${msToHuman(cd.remaining)}**.`, RED)],
      });
    }

    const sym = cfg.currencySymbol || '💎';
    const name = cfg.currencyName || 'Flynn Coins';
    const min = cfg.begMin ?? 10;
    const max = cfg.begMax ?? 75;
    const msg = BEG_MESSAGES[Math.floor(Math.random() * BEG_MESSAGES.length)];
    const giver = BEG_GIVERS[Math.floor(Math.random() * BEG_GIVERS.length)];

    // 90% chance of success
    const success = Math.random() < 0.9;
    profile.lastBeg = new Date();

    if (!success) {
      await profile.save();
      return interaction.editReply({
        embeds: [economyEmbed('🫙 No Luck Today', `You begged: *"${msg}"*\nEverybody ignored you.`, RED)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))],
      });
    }

    const earned = Math.floor(Math.random() * (max - min + 1)) + min;
    profile.wallet += earned;
    profile.totalEarned = (profile.totalEarned || 0) + earned;
    profile.netWorth = profile.wallet + profile.bank;
    await profile.save();

    const embed = economyEmbed('🫙 Begging Successful', `You begged: *"${msg}"*\n**${giver}** took pity on you!`, GREEN)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '💰 Received', value: `${sym} **${earned.toLocaleString()}** ${name}`, inline: true },
        { name: '👝 New Wallet', value: `${sym} **${profile.wallet.toLocaleString()}** ${name}`, inline: true },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};

const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed, GREEN, RED, SAPPHIRE,
} = require('../../lib/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('give')
    .setDescription('Give coins from your wallet to another user.')
    .addUserOption((opt) => opt.setName('user').setDescription('Who to give coins to').setRequired(true))
    .addIntegerOption((opt) => opt.setName('amount').setDescription('Amount to give').setRequired(true).setMinValue(1)),
  async execute(interaction) {
    await interaction.deferReply();
    const cfg = await getConfig(interaction.guildId);
    if (!cfg.enabled) return interaction.editReply({ embeds: [disabledEmbed()] });
    if (!isChannelAllowed(cfg, interaction.channelId)) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Wrong Channel', 'Economy commands are restricted to specific channels.', RED)] });
    }

    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const sym = cfg.currencySymbol || '💎';
    const name = cfg.currencyName || 'Flynn Coins';

    if (target.id === interaction.user.id) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Invalid', 'You can\'t give coins to yourself.', RED)] });
    }
    if (target.bot) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Invalid', 'You can\'t give coins to a bot.', RED)] });
    }

    const profile = await getProfile(interaction.guildId, interaction.user.id);
    if (amount > profile.wallet) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Insufficient Funds', `You only have **${sym} ${profile.wallet.toLocaleString()}** in your wallet.`, RED)] });
    }

    const targetProfile = await getProfile(interaction.guildId, target.id);
    profile.wallet -= amount;
    targetProfile.wallet += amount;
    profile.totalSpent = (profile.totalSpent || 0) + amount;
    profile.netWorth = profile.wallet + profile.bank;
    targetProfile.totalEarned = (targetProfile.totalEarned || 0) + amount;
    targetProfile.netWorth = targetProfile.wallet + targetProfile.bank;
    await Promise.all([profile.save(), targetProfile.save()]);

    const embed = economyEmbed('🎁 Coins Sent!', `You gave **${target.username}** ${sym} **${amount.toLocaleString()}** ${name}!`, GREEN)
      .addFields(
        { name: '💸 Given', value: `${sym} **${amount.toLocaleString()}** ${name}`, inline: true },
        { name: '👝 Your Wallet', value: `${sym} **${profile.wallet.toLocaleString()}** ${name}`, inline: true },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};

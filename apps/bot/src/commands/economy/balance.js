const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed, formatCoins, SAPPHIRE,
} = require('../../lib/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your wallet and bank balance.')
    .addUserOption((opt) => opt.setName('user').setDescription('View another user\'s balance').setRequired(false)),
  async execute(interaction) {
    await interaction.deferReply();
    const cfg = await getConfig(interaction.guildId);
    if (!cfg.enabled) return interaction.editReply({ embeds: [disabledEmbed()] });
    if (!isChannelAllowed(cfg, interaction.channelId)) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Wrong Channel', 'Economy commands are restricted to specific channels in this server.', 0xe74c3c)] });
    }

    const target = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    const profile = await getProfile(interaction.guildId, target.id);
    const total = profile.wallet + profile.bank;
    const sym = cfg.currencySymbol || '💎';
    const name = cfg.currencyName || 'Flynn Coins';

    const embed = economyEmbed(
      `${sym} Balance — ${target.username}`,
      null,
      SAPPHIRE
    )
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '👝 Wallet', value: `${sym} **${profile.wallet.toLocaleString()}** ${name}`, inline: true },
        { name: '🏦 Bank', value: `${sym} **${profile.bank.toLocaleString()}** / ${profile.bankCap.toLocaleString()} ${name}`, inline: true },
        { name: '💰 Net Worth', value: `${sym} **${total.toLocaleString()}** ${name}`, inline: false },
      );

    if (member) embed.setAuthor({ name: member.displayName, iconURL: target.displayAvatarURL({ dynamic: true }) });

    await interaction.editReply({ embeds: [embed] });
  },
};

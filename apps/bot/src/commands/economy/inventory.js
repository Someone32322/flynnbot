const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed, SAPPHIRE, RED,
} = require('../../lib/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your inventory.')
    .addUserOption((opt) => opt.setName('user').setDescription('View another user\'s inventory').setRequired(false)),
  async execute(interaction) {
    await interaction.deferReply();
    const cfg = await getConfig(interaction.guildId);
    if (!cfg.enabled) return interaction.editReply({ embeds: [disabledEmbed()] });
    if (!isChannelAllowed(cfg, interaction.channelId)) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Wrong Channel', 'Economy commands are restricted to specific channels.', RED)] });
    }

    const target = interaction.options.getUser('user') || interaction.user;
    const profile = await getProfile(interaction.guildId, target.id);
    const inv = profile.inventory || [];

    if (!inv.length) {
      return interaction.editReply({
        embeds: [economyEmbed(`🎒 ${target.username}'s Inventory`, 'Inventory is empty! Buy items from the `/shop`.', SAPPHIRE)
          .setThumbnail(target.displayAvatarURL({ dynamic: true }))],
      });
    }

    const embed = economyEmbed(`🎒 ${target.username}'s Inventory`, null, SAPPHIRE)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }));

    for (const item of inv.slice(0, 24)) {
      embed.addFields({
        name: `${item.emoji} ${item.name}`,
        value: `Quantity: **${item.quantity}**`,
        inline: true,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

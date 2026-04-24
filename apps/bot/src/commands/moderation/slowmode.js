const { ChannelType, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModeratorAccess, buildSapphireEmbed, ephemeral } = require('../../lib/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set the slowmode delay on a channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((o) =>
      o.setName('seconds').setDescription('Slowmode delay in seconds (0 = off, max 21600)').setRequired(true).setMinValue(0).setMaxValue(21600)
    )
    .addChannelOption((o) =>
      o.setName('channel').setDescription('Channel to set slowmode on (defaults to current)')
    ),

  async execute(interaction) {
    const guard = await requireModeratorAccess(interaction);
    if (!guard) return;

    const seconds = interaction.options.getInteger('seconds', true);
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;

    if (!channel.isTextBased() || channel.type === ChannelType.GuildVoice) {
      return interaction.reply(ephemeral('Slowmode can only be set on text-based channels.'));
    }

    await channel.setRateLimitPerUser(seconds, `Slowmode set by ${interaction.user.tag}`).catch((err) => {
      console.error('[slowmode]', err);
      return null;
    });

    const label = seconds === 0 ? 'off' : `${seconds}s`;

    const embed = buildSapphireEmbed({
      title: 'Slowmode Updated',
      fields: [
        { name: 'Channel', value: `${channel}`, inline: true },
        { name: 'Delay', value: label, inline: true },
        { name: 'Set By', value: interaction.user.tag, inline: true },
      ],
      timestamp: true,
    });

    await interaction.reply({ embeds: [embed] });
  },
};

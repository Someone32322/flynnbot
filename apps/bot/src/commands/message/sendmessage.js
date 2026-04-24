const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModeratorAccess, buildSapphireEmbed, ephemeral } = require('../../lib/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sendmessage')
    .setDescription('Send a plain-text message to a channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption((o) =>
      o.setName('channel').setDescription('Target channel').setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('content').setDescription('Message content (max 2000 chars)').setRequired(true).setMaxLength(2000)
    ),

  async execute(interaction) {
    const guard = await requireModeratorAccess(interaction);
    if (!guard) return;

    const channel = interaction.options.getChannel('channel', true);
    const content = interaction.options.getString('content', true);

    if (!channel.isTextBased()) {
      return interaction.reply(ephemeral('That channel cannot receive messages.'));
    }

    const sent = await channel.send({ content }).catch((err) => {
      console.error('[sendmessage]', err);
      return null;
    });

    if (!sent) {
      return interaction.reply(ephemeral('Failed to send message — check my permissions in that channel.'));
    }

    await interaction.reply(
      ephemeral(`✅ Message sent to ${channel} — [Jump to message](${sent.url})`)
    );
  },
};

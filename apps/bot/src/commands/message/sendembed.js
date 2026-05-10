const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { requireModeratorAccess, ephemeral } = require('../../lib/moderation');
const { ScheduledMessage } = require('../../models/ScheduledMessage');
const { buildMessagePayload } = require('../../lib/scheduler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sendembed')
    .setDescription('Send a saved message template to a channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Target channel')
        .setRequired(true)
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
        )
    )
    .addStringOption((o) =>
      o.setName('name').setDescription('Name of the template to send').setRequired(true)
    ),

  async execute(interaction) {
    const guard = await requireModeratorAccess(interaction);
    if (!guard) return;

    const channel = interaction.options.getChannel('channel', true);
    const name = interaction.options.getString('name', true).trim();

    if (!channel.isTextBased()) {
      return interaction.reply(ephemeral('That channel cannot receive messages.'));
    }

    // Escape regex special characters so template names match literally
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const template = await ScheduledMessage.findOne({
      guildId: interaction.guildId,
      name: { $regex: `^${escapedName}$`, $options: 'i' },
      'delivery.type': 'template',
    });

    if (!template) {
      const allInGuild = await ScheduledMessage.find({ guildId: interaction.guildId, 'delivery.type': 'template' }).select('name').lean();
      const guildList = allInGuild.length ? allInGuild.map((t) => `\`${t.name}\``).join(', ') : '*(none)*';

      return interaction.reply(
        ephemeral(
          `No template found for \`${name}\`.\n` +
          `> **Available in this server:** ${guildList}\n\n` +
          `Templates are created in the **Message Builder** on the dashboard.`
        )
      );
    }

    const payload = buildMessagePayload(template, { channel });

    if (!payload.content && !payload.embeds?.length) {
      return interaction.reply(ephemeral('That template has no content to send.'));
    }

    const sent = await channel.send(payload).catch((err) => {
      console.error('[sendembed]', err);
      return null;
    });

    if (!sent) {
      return interaction.reply(ephemeral('Failed to send — check my permissions in that channel.'));
    }

    await interaction.reply(
      ephemeral(`✅ Template \`${template.name}\` sent to ${channel} — [Jump to message](${sent.url})`)
    );
  },
};

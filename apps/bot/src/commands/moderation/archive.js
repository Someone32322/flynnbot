const { AttachmentBuilder, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { randomUUID } = require('node:crypto');
const { requireModeratorAccess, buildSapphireEmbed, ephemeral } = require('../../lib/moderation');
const { MessageArchive } = require('../../models/MessageArchive');

const SAPPHIRE = 0x0f52ba;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('archive')
    .setDescription('Archive message history for a user or channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
      sub
        .setName('user')
        .setDescription('Archive messages from a specific user in this channel.')
        .addUserOption((o) => o.setName('user').setDescription('User whose messages to archive').setRequired(true))
        .addIntegerOption((o) => o.setName('limit').setDescription('Max messages to scan (default 500, max 2000)').setMinValue(1).setMaxValue(2000))
    )
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Archive all messages in a channel.')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel to archive (defaults to current)'))
        .addIntegerOption((o) => o.setName('limit').setDescription('Max messages to fetch (default 500, max 2000)').setMinValue(1).setMaxValue(2000))
    ),

  async execute(interaction) {
    const guard = await requireModeratorAccess(interaction);
    if (!guard) return;

    await interaction.deferReply({ ephemeral: false });

    const sub = interaction.options.getSubcommand();
    const limit = interaction.options.getInteger('limit') ?? 500;
    let channel = interaction.channel;
    let targetUser = null;
    let targetType, targetId, targetName;

    if (sub === 'user') {
      targetUser = interaction.options.getUser('user', true);
      targetType = 'user';
      targetId = targetUser.id;
      targetName = targetUser.tag;
    } else {
      channel = interaction.options.getChannel('channel') ?? interaction.channel;
      targetType = 'channel';
      targetId = channel.id;
      targetName = `#${channel.name}`;
    }

    // Fetch messages in batches
    const allMessages = [];
    let lastId = null;
    while (allMessages.length < limit) {
      const batch = await channel.messages
        .fetch({ limit: Math.min(100, limit - allMessages.length), ...(lastId ? { before: lastId } : {}) })
        .catch(() => null);
      if (!batch || batch.size === 0) break;
      for (const msg of batch.values()) {
        if (sub === 'channel' || msg.author.id === targetUser.id) {
          allMessages.push(msg);
        }
      }
      lastId = batch.last()?.id;
      if (batch.size < 100) break;
    }

    allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    if (allMessages.length === 0) {
      return interaction.editReply(ephemeral('No messages found for the given target.'));
    }

    // Build text transcript
    const lines = allMessages.map((msg) => {
      const ts = new Date(msg.createdTimestamp).toISOString();
      const attach = msg.attachments.size ? ` [${[...msg.attachments.values()].map((a) => a.url).join(', ')}]` : '';
      return `[${ts}] ${msg.author.tag} (${msg.author.id}): ${msg.content}${attach}`;
    });
    const transcript = lines.join('\n');

    const archiveId = randomUUID().split('-')[0].toUpperCase();
    const archiveDoc = {
      guildId: interaction.guildId,
      archiveId,
      targetType,
      targetId,
      targetName,
      createdById: interaction.user.id,
      createdByTag: interaction.user.tag,
      messageCount: allMessages.length,
      messages: allMessages.map((msg) => ({
        authorId: msg.author.id,
        authorTag: msg.author.tag,
        content: msg.content,
        timestamp: msg.createdAt,
        attachments: [...msg.attachments.values()].map((a) => a.url),
        embedCount: msg.embeds.length,
      })),
    };

    await MessageArchive.create(archiveDoc);

    const file = new AttachmentBuilder(Buffer.from(transcript, 'utf-8'), {
      name: `archive-${archiveId}.txt`,
    });

    const embed = buildSapphireEmbed({
      title: `Archive \`${archiveId}\` — ${targetName}`,
      fields: [
        { name: 'Target', value: targetType === 'user' ? `<@${targetId}>` : `<#${targetId}>`, inline: true },
        { name: 'Type', value: targetType, inline: true },
        { name: 'Messages', value: String(allMessages.length), inline: true },
        { name: 'Archived By', value: `${interaction.user.tag}`, inline: true },
        { name: 'Archive ID', value: `\`${archiveId}\``, inline: true },
      ],
      timestamp: true,
    });

    await interaction.editReply({ embeds: [embed], files: [file] });
  },
};

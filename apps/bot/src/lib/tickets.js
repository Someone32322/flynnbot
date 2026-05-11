/**
 * Ticket system handler for the bot.
 *
 * Handles:
 *  - Creating ticket channels on button click
 *  - Claiming / unclaiming tickets
 *  - Closing tickets (with optional transcript)
 *  - Auto-close on inactivity (via scheduler polling)
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  OverwriteType,
} = require('discord.js');
const { randomUUID } = require('crypto');
const { TicketConfig } = require('../models/TicketConfig');
const { Ticket } = require('../models/Ticket');

// ── Config cache ──────────────────────────────────────────────────────────────
const configCache = new Map();
const CONFIG_TTL = 30_000;

async function getConfig(guildId) {
  const cached = configCache.get(guildId);
  if (cached && Date.now() - cached.fetchedAt < CONFIG_TTL) return cached.config;
  const config = await TicketConfig.findOne({ guildId }).lean();
  configCache.set(guildId, { config, fetchedAt: Date.now() });
  return config;
}

function invalidateCache(guildId) {
  configCache.delete(guildId);
}

// ── Create ticket ─────────────────────────────────────────────────────────────
async function createTicket(interaction, panelId, category) {
  await interaction.deferReply({ ephemeral: true });
  const { guild, user } = interaction;

  const config = await getConfig(guild.id);
  if (!config || !config.enabled) {
    return interaction.editReply({ content: 'Tickets are currently disabled.' });
  }

  const panel = config.panels.find((p) => p.panelId === panelId);
  if (!panel) {
    return interaction.editReply({ content: 'This ticket panel no longer exists.' });
  }

  // Check max open per user
  const openCount = await Ticket.countDocuments({
    guildId: guild.id,
    userId: user.id,
    status: 'open',
  });

  if (openCount >= (panel.maxOpenPerUser || 1)) {
    return interaction.editReply({
      content: `You already have ${openCount} open ticket(s). Please close existing tickets before opening a new one.`,
    });
  }

  // Build channel name
  const ticketId = randomUUID().split('-')[0].toUpperCase();
  const channelName = (panel.ticketNameFormat || 'ticket-{username}')
    .replace('{username}', user.username.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .replace('{id}', ticketId.toLowerCase())
    .slice(0, 100);

  // Permission overwrites
  const overwrites = [
    { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  for (const roleId of (panel.supportRoles || [])) {
    const role = guild.roles.cache.get(roleId);
    if (role) {
      overwrites.push({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.AttachFiles,
        ],
      });
    }
  }

  const channelOptions = {
    name: channelName,
    type: ChannelType.GuildText,
    permissionOverwrites: overwrites,
  };
  if (panel.categoryId) channelOptions.parent = panel.categoryId;

  let ticketChannel;
  try {
    ticketChannel = await guild.channels.create(channelOptions);
  } catch (err) {
    console.error('[Tickets] Failed to create channel:', err.message);
    return interaction.editReply({ content: 'Failed to create ticket channel. Please contact an admin.' });
  }

  // Save ticket to DB
  const ticket = await Ticket.create({
    ticketId,
    guildId: guild.id,
    channelId: ticketChannel.id,
    userId: user.id,
    panelId,
    category: category || panel.buttons?.[0]?.category || 'General',
    status: 'open',
    openedAt: new Date(),
    lastActivity: new Date(),
  });

  // Send welcome embed in new channel
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🎫 Ticket #${ticketId}`)
    .setDescription(panel.welcomeMessage || 'Support will be with you shortly.')
    .addFields(
      { name: 'Category', value: ticket.category, inline: true },
      { name: 'Opened by', value: `<@${user.id}>`, inline: true },
    )
    .setFooter({ text: `Ticket ID: ${ticketId}` })
    .setTimestamp();

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:close:${ticketId}`)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒'),
    new ButtonBuilder()
      .setCustomId(`ticket:claim:${ticketId}`)
      .setLabel('Claim')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🙋'),
  );

  await ticketChannel.send({
    content: `<@${user.id}> ${panel.supportRoles?.map((r) => `<@&${r}>`).join(' ') || ''}`,
    embeds: [embed],
    components: [closeRow],
  }).catch(() => null);

  // Log ticket open
  if (config.logChannelId) {
    const logChannel = guild.channels.cache.get(config.logChannelId);
    if (logChannel) {
      await logChannel.send({
        embeds: [{
          color: 0x22c55e,
          title: '🎫 Ticket Opened',
          fields: [
            { name: 'Ticket', value: `#${ticketId} — <#${ticketChannel.id}>`, inline: true },
            { name: 'User', value: `<@${user.id}>`, inline: true },
            { name: 'Category', value: ticket.category, inline: true },
          ],
          timestamp: new Date().toISOString(),
        }],
      }).catch(() => null);
    }
  }

  await interaction.editReply({
    content: `Your ticket has been created: <#${ticketChannel.id}>`,
  });
}

// ── Close ticket ──────────────────────────────────────────────────────────────
async function closeTicket(interaction, ticketId) {
  await interaction.deferReply({ ephemeral: true });
  const { guild, user } = interaction;

  const ticket = await Ticket.findOne({ ticketId, guildId: guild.id, status: 'open' });
  if (!ticket) {
    return interaction.editReply({ content: 'Ticket not found or already closed.' });
  }

  const config = await getConfig(guild.id);
  const panel = config?.panels.find((p) => p.panelId === ticket.panelId);

  // Check if user can close (opener or support role member)
  const member = interaction.member;
  const canClose = ticket.userId === user.id
    || (panel?.supportRoles || []).some((r) => member.roles.cache.has(r))
    || member.permissions.has(PermissionFlagsBits.ManageChannels);

  if (!canClose) {
    return interaction.editReply({ content: 'You do not have permission to close this ticket.' });
  }

  // Generate transcript if enabled
  if (panel?.transcripts?.enabled && panel.transcripts.channelId) {
    await generateTranscript(guild, ticket, panel.transcripts.channelId);
  }

  // Update DB
  await Ticket.updateOne(
    { ticketId },
    { status: 'closed', closedBy: user.id, closedAt: new Date() },
  );

  // Log ticket close
  if (config?.logChannelId) {
    const logChannel = guild.channels.cache.get(config.logChannelId);
    if (logChannel) {
      await logChannel.send({
        embeds: [{
          color: 0xef4444,
          title: '🔒 Ticket Closed',
          fields: [
            { name: 'Ticket', value: `#${ticketId}`, inline: true },
            { name: 'Closed by', value: `<@${user.id}>`, inline: true },
          ],
          timestamp: new Date().toISOString(),
        }],
      }).catch(() => null);
    }
  }

  // Delete channel after brief delay
  const channel = guild.channels.cache.get(ticket.channelId);
  if (channel) {
    await channel.send({
      embeds: [{
        color: 0xef4444,
        description: `🔒 Ticket closed by <@${user.id}>. This channel will be deleted in 5 seconds.`,
      }],
    }).catch(() => null);
    setTimeout(async () => {
      await channel.delete('Ticket closed').catch(() => null);
    }, 5000);
  }

  await interaction.editReply({ content: 'Ticket closed successfully.' });
}

// ── Claim / unclaim ───────────────────────────────────────────────────────────
async function claimTicket(interaction, ticketId) {
  await interaction.deferReply({ ephemeral: true });
  const { guild, user } = interaction;

  const ticket = await Ticket.findOne({ ticketId, guildId: guild.id, status: 'open' });
  if (!ticket) {
    return interaction.editReply({ content: 'Ticket not found or closed.' });
  }

  const config = await getConfig(guild.id);
  const panel = config?.panels.find((p) => p.panelId === ticket.panelId);
  const isSupport = (panel?.supportRoles || []).some((r) => interaction.member.roles.cache.has(r))
    || interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

  if (!isSupport) {
    return interaction.editReply({ content: 'Only support team members can claim tickets.' });
  }

  if (ticket.claimedBy === user.id) {
    // Unclaim
    await Ticket.updateOne({ ticketId }, { claimedBy: null });
    await interaction.editReply({ content: 'Ticket unclaimed.' });
    await interaction.channel?.send({
      content: `🙋 <@${user.id}> has unclaimed this ticket.`,
    }).catch(() => null);
  } else {
    await Ticket.updateOne({ ticketId }, { claimedBy: user.id });
    await interaction.editReply({ content: 'Ticket claimed.' });
    await interaction.channel?.send({
      content: `🙋 <@${user.id}> has claimed this ticket and will be assisting you.`,
    }).catch(() => null);
  }
}

// ── Transcript generation ─────────────────────────────────────────────────────
async function generateTranscript(guild, ticket, transcriptChannelId) {
  const channel = guild.channels.cache.get(ticket.channelId);
  if (!channel) return;

  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const lines = sorted.map((m) => {
      const ts = new Date(m.createdTimestamp).toISOString();
      const content = m.content || (m.embeds.length ? '[embed]' : '[attachment]');
      return `[${ts}] ${m.author.tag}: ${content}`;
    });

    const transcriptContent = [
      `Ticket: #${ticket.ticketId}`,
      `Opened by: ${ticket.userId}`,
      `Opened: ${ticket.openedAt?.toISOString()}`,
      `Category: ${ticket.category}`,
      '---',
      ...lines,
    ].join('\n');

    const transcriptChannel = guild.channels.cache.get(transcriptChannelId);
    if (transcriptChannel) {
      const { AttachmentBuilder } = require('discord.js');
      const buffer = Buffer.from(transcriptContent, 'utf8');
      const attachment = new AttachmentBuilder(buffer, { name: `ticket-${ticket.ticketId}.txt` });
      await transcriptChannel.send({
        embeds: [{
          color: 0x6b7280,
          title: `📋 Ticket Transcript — #${ticket.ticketId}`,
          fields: [
            { name: 'Opened by', value: `<@${ticket.userId}>`, inline: true },
            { name: 'Category', value: ticket.category, inline: true },
            { name: 'Messages', value: String(sorted.length), inline: true },
          ],
        }],
        files: [attachment],
      }).catch(() => null);
    }
  } catch (err) {
    console.error('[Tickets] Transcript error:', err.message);
  }
}

// ── Panel deployment ──────────────────────────────────────────────────────────
async function deployPanel(guild, panelId) {
  const config = await TicketConfig.findOne({ guildId: guild.id });
  if (!config) return { error: 'No ticket config found' };

  const panel = config.panels.find((p) => p.panelId === panelId);
  if (!panel) return { error: 'Panel not found' };

  const channel = guild.channels.cache.get(panel.channelId);
  if (!channel) return { error: 'Panel channel not found' };

  const styleMap = {
    primary: ButtonStyle.Primary,
    secondary: ButtonStyle.Secondary,
    success: ButtonStyle.Success,
    danger: ButtonStyle.Danger,
  };

  const row = new ActionRowBuilder();
  for (const btn of (panel.buttons || []).slice(0, 5)) {
    const button = new ButtonBuilder()
      .setCustomId(`ticket:create:${panel.panelId}:${encodeURIComponent(btn.category || 'General')}`)
      .setLabel(btn.label || 'Open Ticket')
      .setStyle(styleMap[btn.style] || ButtonStyle.Primary);
    if (btn.emoji) {
      try { button.setEmoji(btn.emoji); } catch { /* invalid emoji, skip */ }
    }
    row.addComponents(button);
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(panel.name)
    .setDescription(panel.description || 'Click a button below to open a support ticket.');

  // Delete old message if exists
  if (panel.messageId) {
    const oldMsg = await channel.messages.fetch(panel.messageId).catch(() => null);
    if (oldMsg) await oldMsg.delete().catch(() => null);
  }

  const msg = await channel.send({ embeds: [embed], components: [row] });

  // Update messageId
  const panelIndex = config.panels.findIndex((p) => p.panelId === panelId);
  config.panels[panelIndex].messageId = msg.id;
  await config.save();
  invalidateCache(guild.id);

  return { success: true, messageId: msg.id };
}

// ── Auto-close check (called by scheduler) ───────────────────────────────────
async function checkAutoClose(client) {
  const configs = await TicketConfig.find({ enabled: true }).lean();
  for (const cfg of configs) {
    const panelsWithAutoClose = (cfg.panels || []).filter((p) => p.autoCloseHours > 0);
    if (!panelsWithAutoClose.length) continue;

    for (const panel of panelsWithAutoClose) {
      const cutoff = new Date(Date.now() - panel.autoCloseHours * 3_600_000);
      const staleTickets = await Ticket.find({
        guildId: cfg.guildId,
        panelId: panel.panelId,
        status: 'open',
        lastActivity: { $lt: cutoff },
      });

      const guild = client.guilds.cache.get(cfg.guildId);
      if (!guild) continue;

      for (const ticket of staleTickets) {
        const channel = guild.channels.cache.get(ticket.channelId);
        if (channel) {
          await channel.send({
            embeds: [{
              color: 0xf59e0b,
              description: `⏰ This ticket has been inactive for ${panel.autoCloseHours} hour(s) and will be auto-closed.`,
            }],
          }).catch(() => null);

          if (panel.transcripts?.enabled && panel.transcripts.channelId) {
            await generateTranscript(guild, ticket, panel.transcripts.channelId);
          }

          await channel.delete('Auto-close: inactivity').catch(() => null);
        }

        await Ticket.updateOne(
          { ticketId: ticket.ticketId },
          { status: 'closed', closedBy: 'AUTO', closedAt: new Date() },
        );
      }
    }
  }
}

module.exports = {
  createTicket,
  closeTicket,
  claimTicket,
  deployPanel,
  checkAutoClose,
  invalidateCache,
};

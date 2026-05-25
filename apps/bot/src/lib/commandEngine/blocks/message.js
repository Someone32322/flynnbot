'use strict';

/**
 * blocks/message.js
 * Discord message & interaction action blocks.
 */

const { EmbedBuilder, MessageFlags } = require('discord.js');

// ── Helpers ───────────────────────────────────────────────────

function buildEmbed(rawEmbed, ctx) {
  const e = new EmbedBuilder();
  if (rawEmbed.title)       e.setTitle(ctx.resolve(String(rawEmbed.title)).slice(0, 256));
  if (rawEmbed.description) e.setDescription(ctx.resolve(String(rawEmbed.description)).slice(0, 4096));
  if (rawEmbed.color)       e.setColor(typeof rawEmbed.color === 'number' ? rawEmbed.color : 0x5865f2);
  if (rawEmbed.footer)      e.setFooter({ text: ctx.resolve(String(rawEmbed.footer)).slice(0, 2048) });
  if (rawEmbed.imageUrl)    e.setImage(ctx.resolve(String(rawEmbed.imageUrl)));
  if (rawEmbed.thumbnail)   e.setThumbnail(ctx.resolve(String(rawEmbed.thumbnail)));
  if (rawEmbed.author)      e.setAuthor({ name: ctx.resolve(String(rawEmbed.author)).slice(0, 256) });
  if (rawEmbed.timestamp)   e.setTimestamp();
  if (Array.isArray(rawEmbed.fields)) {
    for (const f of rawEmbed.fields.slice(0, 25)) {
      if (f.name && f.value) {
        e.addFields({
          name:   ctx.resolve(String(f.name)).slice(0, 256),
          value:  ctx.resolve(String(f.value)).slice(0, 1024),
          inline: Boolean(f.inline),
        });
      }
    }
  }
  return e;
}

function buildEmbeds(rawList, ctx) {
  if (!Array.isArray(rawList) || !rawList.length) return [];
  return rawList.slice(0, 10).map(e => buildEmbed(e, ctx));
}

function buildPayload(data, ctx) {
  const payload = {};
  if (data.content) {
    const c = ctx.resolve(String(data.content)).slice(0, 2000);
    if (c) payload.content = c;
  }
  const embeds = buildEmbeds(data.embeds, ctx);
  if (embeds.length) payload.embeds = embeds;
  if (!payload.content && !payload.embeds?.length) {
    payload.content = '\u200B'; // Zero-width space fallback
  }
  return payload;
}

// ── Module ────────────────────────────────────────────────────

/**
 * @param {import('../BlockRegistry').BlockRegistry} registry
 */
function register(registry) {

  // ── reply ────────────────────────────────────────────────────
  registry.register('reply', {
    category: 'response',
    label:    'Reply',
    icon:     '↩️',
    color:    '#5865f2',
    description: 'Reply to the triggering interaction or message',
    schema: {
      content:   { type: 'textarea', label: 'Content', placeholder: 'Hello {user}!' },
      ephemeral: { type: 'toggle',   label: 'Ephemeral (only visible to triggering user)' },
      embeds:    { type: 'embed_list', label: 'Embeds' },
    },
    async execute(data, ctx) {
      const payload = buildPayload(data, ctx);
      if (data.ephemeral) payload.flags = MessageFlags.Ephemeral;

      const interaction = ctx.interaction;
      if (interaction) {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(payload);
        } else {
          await interaction.reply(payload);
        }
        return;
      }
      // Fallback: send to channel
      if (ctx.channel) {
        await ctx.channel.send(payload);
      }
    },
  });

  // ── send_message ─────────────────────────────────────────────
  registry.register('send_message', {
    category: 'response',
    label:    'Send Message',
    icon:     '💬',
    color:    '#5865f2',
    description: 'Send a message to a specific channel',
    schema: {
      channelId: { type: 'text',     label: 'Channel ID', placeholder: '{channel.id}' },
      content:   { type: 'textarea', label: 'Content' },
      embeds:    { type: 'embed_list', label: 'Embeds' },
    },
    async execute(data, ctx) {
      const chanId = ctx.resolve(String(data.channelId || '')).trim() || ctx.channel?.id;
      if (!chanId) return;
      const channel = ctx.guild?.channels?.cache?.get(chanId) || await ctx.client.channels.fetch(chanId).catch(() => null);
      if (!channel?.isTextBased?.()) return;
      const payload = buildPayload(data, ctx);
      await channel.send(payload);
    },
  });

  // ── send_dm ───────────────────────────────────────────────────
  registry.register('send_dm', {
    category: 'response',
    label:    'Send DM',
    icon:     '📨',
    color:    '#5865f2',
    description: 'Send a direct message to a user',
    schema: {
      userId:  { type: 'text',     label: 'User ID', placeholder: '{user.id}' },
      content: { type: 'textarea', label: 'Content' },
      embeds:  { type: 'embed_list', label: 'Embeds' },
    },
    async execute(data, ctx) {
      const userId = ctx.resolve(String(data.userId || '')).trim() || ctx.userId;
      if (!userId) return;
      const user = await ctx.client.users.fetch(userId).catch(() => null);
      if (!user) return;
      const payload = buildPayload(data, ctx);
      await user.send(payload).catch(() => null); // DMs can fail; non-fatal
    },
  });

  // ── edit_reply ────────────────────────────────────────────────
  registry.register('edit_reply', {
    category: 'response',
    label:    'Edit Reply',
    icon:     '✏️',
    color:    '#5865f2',
    description: 'Edit the already-sent interaction reply',
    schema: {
      content: { type: 'textarea', label: 'New Content' },
      embeds:  { type: 'embed_list', label: 'Embeds' },
    },
    async execute(data, ctx) {
      if (!ctx.interaction) return;
      const payload = buildPayload(data, ctx);
      await ctx.interaction.editReply(payload).catch(() => null);
    },
  });

  // ── edit_message ──────────────────────────────────────────────
  registry.register('edit_message', {
    category: 'response',
    label:    'Edit Message',
    icon:     '✏️',
    color:    '#5865f2',
    schema: {
      channelId: { type: 'text',     label: 'Channel ID' },
      messageId: { type: 'text',     label: 'Message ID' },
      content:   { type: 'textarea', label: 'New Content' },
    },
    async execute(data, ctx) {
      const chanId  = ctx.resolve(String(data.channelId || '')).trim() || ctx.channel?.id;
      const msgId   = ctx.resolve(String(data.messageId || '')).trim();
      if (!chanId || !msgId) return;
      const channel = ctx.guild?.channels?.cache?.get(chanId) || await ctx.client.channels.fetch(chanId).catch(() => null);
      const msg     = await channel?.messages?.fetch(msgId).catch(() => null);
      if (!msg) return;
      const payload = buildPayload(data, ctx);
      await msg.edit(payload).catch(() => null);
    },
  });

  // ── delete_message ────────────────────────────────────────────
  registry.register('delete_message', {
    category: 'response',
    label:    'Delete Message',
    icon:     '🗑️',
    color:    '#ed4245',
    schema: {
      channelId: { type: 'text', label: 'Channel ID (optional, defaults to current)' },
      messageId: { type: 'text', label: 'Message ID' },
    },
    async execute(data, ctx) {
      const chanId = ctx.resolve(String(data.channelId || '')).trim() || ctx.channel?.id;
      const msgId  = ctx.resolve(String(data.messageId || '')).trim() || ctx.message?.id;
      if (!chanId || !msgId) return;
      const channel = ctx.guild?.channels?.cache?.get(chanId) || await ctx.client.channels.fetch(chanId).catch(() => null);
      const msg     = await channel?.messages?.fetch(msgId).catch(() => null);
      await msg?.delete().catch(() => null);
    },
  });

  // ── pin_message ───────────────────────────────────────────────
  registry.register('pin_message', {
    category: 'response',
    label:    'Pin Message',
    icon:     '📌',
    color:    '#fee75c',
    schema: {
      channelId: { type: 'text', label: 'Channel ID (optional)' },
      messageId: { type: 'text', label: 'Message ID (optional, defaults to triggering message)' },
    },
    async execute(data, ctx) {
      const chanId = ctx.resolve(String(data.channelId || '')).trim() || ctx.channel?.id;
      const msgId  = ctx.resolve(String(data.messageId || '')).trim() || ctx.message?.id;
      if (!chanId || !msgId) return;
      const channel = ctx.guild?.channels?.cache?.get(chanId) || await ctx.client.channels.fetch(chanId).catch(() => null);
      const msg     = await channel?.messages?.fetch(msgId).catch(() => null);
      await msg?.pin().catch(() => null);
    },
  });

  // ── add_reaction ──────────────────────────────────────────────
  registry.register('add_reaction', {
    category: 'response',
    label:    'Add Reaction',
    icon:     '😀',
    color:    '#fee75c',
    schema: {
      emoji:     { type: 'text', label: 'Emoji', placeholder: '⭐ or <:name:id>' },
      messageId: { type: 'text', label: 'Message ID (optional, defaults to triggering message)' },
      channelId: { type: 'text', label: 'Channel ID (optional)' },
    },
    async execute(data, ctx) {
      const emoji  = ctx.resolve(String(data.emoji || '')).trim();
      if (!emoji) return;
      const chanId = ctx.resolve(String(data.channelId || '')).trim() || ctx.channel?.id;
      const msgId  = ctx.resolve(String(data.messageId || '')).trim() || ctx.message?.id;
      if (!chanId || !msgId) return;
      const channel = ctx.guild?.channels?.cache?.get(chanId) || await ctx.client.channels.fetch(chanId).catch(() => null);
      const msg     = await channel?.messages?.fetch(msgId).catch(() => null);
      await msg?.react(emoji).catch(() => null);
    },
  });

  // ── send_ephemeral ────────────────────────────────────────────
  registry.register('send_ephemeral', {
    category: 'response',
    label:    'Send Ephemeral Reply',
    icon:     '👁️',
    color:    '#5865f2',
    description: 'Reply that only the triggering user can see',
    schema: {
      content: { type: 'textarea', label: 'Content', placeholder: 'Only you can see this: {user.name}' },
      embeds:  { type: 'embed_list', label: 'Embeds' },
    },
    async execute(data, ctx) {
      const payload = buildPayload(data, ctx);
      payload.flags = MessageFlags.Ephemeral;
      if (ctx.interaction) {
        if (ctx.interaction.deferred || ctx.interaction.replied) {
          await ctx.interaction.editReply(payload).catch(() => null);
        } else {
          await ctx.interaction.reply(payload).catch(() => null);
        }
      }
    },
  });

  // ── show_modal ────────────────────────────────────────────────
  registry.register('show_modal', {
    category: 'response',
    label:    'Show Modal',
    icon:     '📋',
    color:    '#5865f2',
    description: 'Show a modal form to the user (slash/button triggers only)',
    schema: {
      customId: { type: 'text', label: 'Custom ID (matches a modal_submit trigger)', placeholder: 'my_modal' },
      title:    { type: 'text', label: 'Modal Title', placeholder: 'Enter Details' },
      fields:   { type: 'modal_fields', label: 'Text Inputs' },
    },
    async execute(data, ctx) {
      if (!ctx.interaction || !ctx.interaction.showModal) return;
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      const customId = ctx.resolve(String(data.customId || 'modal')).slice(0, 100);
      const title    = ctx.resolve(String(data.title || 'Form')).slice(0, 45);

      const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
      const inputs = Array.isArray(data.fields) ? data.fields.slice(0, 5) : [];

      for (const f of inputs) {
        const input = new TextInputBuilder()
          .setCustomId(String(f.customId || f.label || 'field').slice(0, 100))
          .setLabel(ctx.resolve(String(f.label || 'Input')).slice(0, 45))
          .setStyle(f.style === 'long' ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(Boolean(f.required))
          .setPlaceholder(f.placeholder ? ctx.resolve(String(f.placeholder)).slice(0, 100) : '');
        modal.addComponents(new ActionRowBuilder().addComponents(input));
      }

      await ctx.interaction.showModal(modal).catch(() => null);
    },
  });
}

module.exports = { register };

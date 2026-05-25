'use strict';

/**
 * blocks/channel.js
 * Channel action blocks.
 */

const { PermissionFlagsBits } = require('discord.js');

/**
 * @param {import('../BlockRegistry').BlockRegistry} registry
 */
function register(registry) {

  // ── set_channel_topic ─────────────────────────────────────────
  registry.register('set_channel_topic', {
    category: 'channels',
    label:    'Set Channel Topic',
    icon:     '📝',
    color:    '#5865f2',
    schema: {
      channelId: { type: 'text', label: 'Channel ID (optional, defaults to current channel)' },
      topic:     { type: 'text', label: 'Topic',  placeholder: 'New topic text' },
      reason:    { type: 'text', label: 'Reason (optional)' },
    },
    async execute(data, ctx) {
      const chanId = ctx.resolve(String(data.channelId || '')).trim() || ctx.channel?.id;
      if (!chanId || !ctx.guild) return;
      const channel = ctx.guild.channels.cache.get(chanId) || await ctx.client.channels.fetch(chanId).catch(() => null);
      if (!channel?.isTextBased?.()) return;
      const topic  = ctx.resolve(String(data.topic || '')).slice(0, 1024);
      const reason = ctx.resolve(String(data.reason || '')) || undefined;
      await channel.setTopic(topic, reason).catch(() => null);
    },
  });

  // ── set_slowmode ──────────────────────────────────────────────
  registry.register('set_slowmode', {
    category: 'channels',
    label:    'Set Slowmode',
    icon:     '🐢',
    color:    '#5865f2',
    schema: {
      channelId: { type: 'text',   label: 'Channel ID (optional)' },
      seconds:   { type: 'number', label: 'Seconds (0 to disable)', min: 0, max: 21600 },
      reason:    { type: 'text',   label: 'Reason (optional)' },
    },
    async execute(data, ctx) {
      const chanId = ctx.resolve(String(data.channelId || '')).trim() || ctx.channel?.id;
      if (!chanId || !ctx.guild) return;
      const channel  = ctx.guild.channels.cache.get(chanId) || await ctx.client.channels.fetch(chanId).catch(() => null);
      if (!channel) return;
      const seconds  = Math.min(21600, Math.max(0, parseInt(data.seconds) || 0));
      const reason   = ctx.resolve(String(data.reason || '')) || undefined;
      await channel.setRateLimitPerUser(seconds, reason).catch(() => null);
    },
  });

  // ── lock_channel ──────────────────────────────────────────────
  registry.register('lock_channel', {
    category: 'channels',
    label:    'Lock Channel',
    icon:     '🔒',
    color:    '#ed4245',
    schema: {
      channelId: { type: 'text', label: 'Channel ID (optional)' },
      reason:    { type: 'text', label: 'Reason (optional)' },
    },
    async execute(data, ctx) {
      const chanId = ctx.resolve(String(data.channelId || '')).trim() || ctx.channel?.id;
      if (!chanId || !ctx.guild) return;
      const channel = ctx.guild.channels.cache.get(chanId) || await ctx.client.channels.fetch(chanId).catch(() => null);
      if (!channel) return;
      const reason = ctx.resolve(String(data.reason || '')) || undefined;
      const everyoneRole = ctx.guild.roles.everyone;
      await channel.permissionOverwrites.edit(everyoneRole, {
        SendMessages: false,
        SendMessagesInThreads: false,
      }, { reason }).catch(() => null);
    },
  });

  // ── unlock_channel ────────────────────────────────────────────
  registry.register('unlock_channel', {
    category: 'channels',
    label:    'Unlock Channel',
    icon:     '🔓',
    color:    '#3ba55c',
    schema: {
      channelId: { type: 'text', label: 'Channel ID (optional)' },
      reason:    { type: 'text', label: 'Reason (optional)' },
    },
    async execute(data, ctx) {
      const chanId = ctx.resolve(String(data.channelId || '')).trim() || ctx.channel?.id;
      if (!chanId || !ctx.guild) return;
      const channel = ctx.guild.channels.cache.get(chanId) || await ctx.client.channels.fetch(chanId).catch(() => null);
      if (!channel) return;
      const reason = ctx.resolve(String(data.reason || '')) || undefined;
      const everyoneRole = ctx.guild.roles.everyone;
      await channel.permissionOverwrites.edit(everyoneRole, {
        SendMessages: null,
        SendMessagesInThreads: null,
      }, { reason }).catch(() => null);
    },
  });

  // ── create_thread ─────────────────────────────────────────────
  registry.register('create_thread', {
    category: 'channels',
    label:    'Create Thread',
    icon:     '🧵',
    color:    '#5865f2',
    schema: {
      name:      { type: 'text',   label: 'Thread Name' },
      channelId: { type: 'text',   label: 'Parent Channel ID (optional)' },
      messageId: { type: 'text',   label: 'Message ID to thread on (optional)' },
      auto_archive_duration: { type: 'select', label: 'Auto-archive After', options: ['60', '1440', '4320', '10080'] },
      result_var: { type: 'text',  label: 'Store Thread ID In (optional)' },
    },
    async execute(data, ctx) {
      const chanId = ctx.resolve(String(data.channelId || '')).trim() || ctx.channel?.id;
      if (!chanId || !ctx.guild) return;
      const channel = ctx.guild.channels.cache.get(chanId) || await ctx.client.channels.fetch(chanId).catch(() => null);
      if (!channel) return;

      const name = ctx.resolve(String(data.name || 'New Thread')).slice(0, 100);
      const autoArchiveDuration = parseInt(data.auto_archive_duration) || 1440;
      const msgId = ctx.resolve(String(data.messageId || '')).trim();

      let thread;
      if (msgId && channel.threads) {
        const msg = await channel.messages.fetch(msgId).catch(() => null);
        if (msg) {
          thread = await channel.threads.create({ name, autoArchiveDuration, startMessage: msg }).catch(() => null);
        }
      }
      if (!thread) {
        thread = await channel.threads?.create({ name, autoArchiveDuration }).catch(() => null);
      }

      const resultVar = String(data.result_var || '').trim();
      if (resultVar && thread?.id) ctx.vars.set(resultVar, thread.id);
    },
  });

  // ── get_channel_info ──────────────────────────────────────────
  registry.register('get_channel_info', {
    category: 'channels',
    label:    'Get Channel Info',
    icon:     '#️⃣',
    color:    '#5865f2',
    schema: {
      channelId:  { type: 'text', label: 'Channel ID', placeholder: '{channel.id}' },
      name_var:   { type: 'text', label: 'Name Variable',    placeholder: 'chanName' },
      id_var:     { type: 'text', label: 'ID Variable',      placeholder: 'chanId' },
      topic_var:  { type: 'text', label: 'Topic Variable',   placeholder: 'chanTopic' },
      exists_var: { type: 'text', label: 'Exists Variable',  placeholder: 'chanExists' },
    },
    async execute(data, ctx) {
      const chanId  = ctx.resolve(String(data.channelId || '')).trim() || ctx.channel?.id;
      if (!chanId || !ctx.guild) return;
      const channel = ctx.guild.channels.cache.get(chanId) || await ctx.client.channels.fetch(chanId).catch(() => null);

      const set = (key, val) => { const v = String(data[key] || '').trim(); if (v) ctx.vars.set(v, val); };
      set('exists_var', channel ? 'true' : 'false');
      if (!channel) return;
      set('name_var',  channel.name || '');
      set('id_var',    channel.id);
      set('topic_var', channel.topic || '');
    },
  });
}

module.exports = { register };

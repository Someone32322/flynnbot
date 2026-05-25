'use strict';

/**
 * blocks/member.js
 * Guild member action blocks.
 */

/**
 * @param {import('../BlockRegistry').BlockRegistry} registry
 */
function register(registry) {

  // ── timeout_member ────────────────────────────────────────────
  registry.register('timeout_member', {
    category: 'members',
    label:    'Timeout Member',
    icon:     '⏰',
    color:    '#ed4245',
    schema: {
      userId:  { type: 'text',   label: 'User ID',               placeholder: '{user.id}' },
      seconds: { type: 'number', label: 'Duration (seconds, max 2419200)', min: 1, max: 2419200 },
      reason:  { type: 'text',   label: 'Reason (optional)' },
    },
    async execute(data, ctx) {
      const userId  = ctx.resolve(String(data.userId || '')).trim() || ctx.userId;
      const seconds = Math.min(2419200, Math.max(1, parseInt(data.seconds) || 60));
      if (!userId || !ctx.guild) return;

      const member = await ctx.guild.members.fetch(userId).catch(() => null);
      if (!member) return;
      const until  = Date.now() + seconds * 1000;
      const reason = ctx.resolve(String(data.reason || '')) || undefined;
      await member.timeout(until - Date.now(), reason).catch(() => null);
    },
  });

  // ── remove_timeout ────────────────────────────────────────────
  registry.register('remove_timeout', {
    category: 'members',
    label:    'Remove Timeout',
    icon:     '✅',
    color:    '#3ba55c',
    schema: {
      userId: { type: 'text', label: 'User ID' },
      reason: { type: 'text', label: 'Reason (optional)' },
    },
    async execute(data, ctx) {
      const userId = ctx.resolve(String(data.userId || '')).trim() || ctx.userId;
      if (!userId || !ctx.guild) return;
      const member = await ctx.guild.members.fetch(userId).catch(() => null);
      if (!member) return;
      await member.timeout(null, ctx.resolve(String(data.reason || '')) || undefined).catch(() => null);
    },
  });

  // ── kick_member ───────────────────────────────────────────────
  registry.register('kick_member', {
    category: 'members',
    label:    'Kick Member',
    icon:     '👢',
    color:    '#ed4245',
    schema: {
      userId: { type: 'text', label: 'User ID' },
      reason: { type: 'text', label: 'Reason (optional)' },
    },
    async execute(data, ctx) {
      const userId = ctx.resolve(String(data.userId || '')).trim() || ctx.userId;
      if (!userId || !ctx.guild) return;
      const member = await ctx.guild.members.fetch(userId).catch(() => null);
      if (!member?.kickable) return;
      await member.kick(ctx.resolve(String(data.reason || '')) || undefined).catch(() => null);
    },
  });

  // ── ban_member ────────────────────────────────────────────────
  registry.register('ban_member', {
    category: 'members',
    label:    'Ban Member',
    icon:     '🔨',
    color:    '#ed4245',
    schema: {
      userId:             { type: 'text',   label: 'User ID' },
      reason:             { type: 'text',   label: 'Reason (optional)' },
      deleteMessageDays:  { type: 'number', label: 'Delete Messages (days, 0-7)', min: 0, max: 7 },
    },
    async execute(data, ctx) {
      const userId = ctx.resolve(String(data.userId || '')).trim() || ctx.userId;
      if (!userId || !ctx.guild) return;
      const deleteMessageSeconds = Math.min(7, Math.max(0, parseInt(data.deleteMessageDays) || 0)) * 86400;
      const reason = ctx.resolve(String(data.reason || '')) || undefined;
      await ctx.guild.members.ban(userId, { deleteMessageSeconds, reason }).catch(() => null);
    },
  });

  // ── set_nickname ──────────────────────────────────────────────
  registry.register('set_nickname', {
    category: 'members',
    label:    'Set Nickname',
    icon:     '✍️',
    color:    '#5865f2',
    schema: {
      userId:   { type: 'text', label: 'User ID (optional, defaults to triggering user)' },
      nickname: { type: 'text', label: 'Nickname (empty to reset)', placeholder: 'Cool Name' },
      reason:   { type: 'text', label: 'Reason (optional)' },
    },
    async execute(data, ctx) {
      const userId = ctx.resolve(String(data.userId || '')).trim() || ctx.userId;
      if (!userId || !ctx.guild) return;
      const member   = await ctx.guild.members.fetch(userId).catch(() => null);
      if (!member) return;
      const nickname = ctx.resolve(String(data.nickname || '')).trim() || null;
      await member.setNickname(nickname, ctx.resolve(String(data.reason || '')) || undefined).catch(() => null);
    },
  });

  // ── get_member_info ───────────────────────────────────────────
  registry.register('get_member_info', {
    category: 'members',
    label:    'Get Member Info',
    icon:     '👤',
    color:    '#5865f2',
    schema: {
      userId:         { type: 'text', label: 'User ID', placeholder: '{user.id}' },
      name_var:       { type: 'text', label: 'Name Variable',       placeholder: 'memberName' },
      id_var:         { type: 'text', label: 'ID Variable',         placeholder: 'memberId' },
      joindate_var:   { type: 'text', label: 'Join Date Variable',  placeholder: 'joinDate' },
      roles_var:      { type: 'text', label: 'Roles Variable',      placeholder: 'roles' },
      joined_var:     { type: 'text', label: 'In Server Variable (true/false)', placeholder: 'isMember' },
    },
    async execute(data, ctx) {
      const userId = ctx.resolve(String(data.userId || '')).trim() || ctx.userId;
      if (!userId || !ctx.guild) return;
      const member = await ctx.guild.members.fetch(userId).catch(() => null);

      const set = (key, val) => { const v = String(data[key] || '').trim(); if (v) ctx.vars.set(v, val); };
      set('joined_var', member ? 'true' : 'false');
      if (!member) return;
      set('name_var',     member.user.username);
      set('id_var',       member.user.id);
      set('joindate_var', member.joinedAt?.toDateString() || '');
      set('roles_var',    member.roles.cache.map(r => r.name).filter(n => n !== '@everyone').join(', '));
    },
  });
}

module.exports = { register };

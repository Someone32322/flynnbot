'use strict';

/**
 * blocks/role.js
 * Role management blocks.
 */

/**
 * @param {import('../BlockRegistry').BlockRegistry} registry
 */
function register(registry) {

  // ── add_role ──────────────────────────────────────────────────
  registry.register('add_role', {
    category: 'roles',
    label:    'Add Role',
    icon:     '🏷️',
    color:    '#3ba55c',
    schema: {
      roleId: { type: 'text', label: 'Role ID',                              placeholder: '123456789012345678' },
      userId: { type: 'text', label: 'User ID (optional, defaults to triggering user)', placeholder: '{user.id}' },
      reason: { type: 'text', label: 'Reason (optional)' },
    },
    async execute(data, ctx) {
      const roleId = ctx.resolve(String(data.roleId || '')).trim();
      if (!roleId || !ctx.guild) return;
      const userId = ctx.resolve(String(data.userId || '')).trim() || ctx.userId;
      if (!userId) return;

      const member = await ctx.guild.members.fetch(userId).catch(() => null);
      if (!member) return;
      await member.roles.add(roleId, ctx.resolve(String(data.reason || '')) || undefined).catch(() => null);
    },
  });

  // ── remove_role ───────────────────────────────────────────────
  registry.register('remove_role', {
    category: 'roles',
    label:    'Remove Role',
    icon:     '🏷️',
    color:    '#3ba55c',
    schema: {
      roleId: { type: 'text', label: 'Role ID' },
      userId: { type: 'text', label: 'User ID (optional)' },
      reason: { type: 'text', label: 'Reason (optional)' },
    },
    async execute(data, ctx) {
      const roleId = ctx.resolve(String(data.roleId || '')).trim();
      if (!roleId || !ctx.guild) return;
      const userId = ctx.resolve(String(data.userId || '')).trim() || ctx.userId;
      if (!userId) return;

      const member = await ctx.guild.members.fetch(userId).catch(() => null);
      if (!member) return;
      await member.roles.remove(roleId, ctx.resolve(String(data.reason || '')) || undefined).catch(() => null);
    },
  });

  // ── toggle_role ───────────────────────────────────────────────
  registry.register('toggle_role', {
    category: 'roles',
    label:    'Toggle Role',
    icon:     '🔀',
    color:    '#3ba55c',
    schema: {
      roleId:     { type: 'text', label: 'Role ID' },
      userId:     { type: 'text', label: 'User ID (optional)' },
      result_var: { type: 'text', label: 'Result Variable (added/removed)', placeholder: 'roleAction' },
    },
    async execute(data, ctx) {
      const roleId = ctx.resolve(String(data.roleId || '')).trim();
      if (!roleId || !ctx.guild) return;
      const userId = ctx.resolve(String(data.userId || '')).trim() || ctx.userId;
      if (!userId) return;

      const member = await ctx.guild.members.fetch(userId).catch(() => null);
      if (!member) return;

      const hasRole = member.roles.cache.has(roleId);
      if (hasRole) {
        await member.roles.remove(roleId).catch(() => null);
      } else {
        await member.roles.add(roleId).catch(() => null);
      }

      const resultVar = String(data.result_var || '').trim();
      if (resultVar) ctx.vars.set(resultVar, hasRole ? 'removed' : 'added');
    },
  });

  // ── check_role ────────────────────────────────────────────────
  registry.register('check_role', {
    category: 'roles',
    label:    'Check Has Role',
    icon:     '🔍',
    color:    '#3ba55c',
    schema: {
      roleId:     { type: 'text', label: 'Role ID' },
      userId:     { type: 'text', label: 'User ID (optional)' },
      result_var: { type: 'text', label: 'Result Variable (true/false)', placeholder: 'hasRole' },
    },
    async execute(data, ctx) {
      const roleId = ctx.resolve(String(data.roleId || '')).trim();
      const resultVar = String(data.result_var || '').trim();
      if (!roleId || !ctx.guild) {
        if (resultVar) ctx.vars.set(resultVar, 'false');
        return;
      }
      const userId = ctx.resolve(String(data.userId || '')).trim() || ctx.userId;
      const member = userId ? await ctx.guild.members.fetch(userId).catch(() => null) : ctx.member;

      const has = member?.roles?.cache?.has(roleId) ?? false;
      if (resultVar) ctx.vars.set(resultVar, String(has));
    },
  });
}

module.exports = { register };

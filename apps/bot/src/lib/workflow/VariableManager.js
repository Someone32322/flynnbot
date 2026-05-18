'use strict';

/**
 * workflow/VariableManager.js
 *
 * Resolves {variable} placeholders in template strings, and
 * provides get/set/increment/delete for flow, user-scoped, and
 * guild-scoped persistent variables.
 *
 * Built-in variables are injected from the ExecutionContext and
 * cannot be overwritten.
 */

const WorkflowVariable = require('../../models/WorkflowVariable');

// Safe placeholder regex: {word_with_underscores_and_digits}
const PLACEHOLDER_RE = /\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g;

// Cap persistent variable values to prevent abuse
const MAX_PERSIST_LEN = 500;

class VariableManager {
  /**
   * @param {import('./ExecutionContext')} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
  }

  // ── Template resolution ───────────────────────────────────

  /**
   * Replace all {name} placeholders in a template string with their values.
   * Unknown placeholders are left as-is (safe — no silent data leaks).
   * @param {string} template
   * @returns {string}
   */
  resolve(template) {
    if (typeof template !== 'string') return String(template ?? '');
    return template.replace(PLACEHOLDER_RE, (_, key) => {
      const val = this._getValue(key);
      return val !== undefined && val !== null ? String(val) : `{${key}}`;
    });
  }

  /**
   * Like resolve(), but returns a numeric value (useful for math blocks).
   * @param {string} template
   * @returns {number}
   */
  resolveNumber(template) {
    const s = this.resolve(template);
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  // ── Flow variable API ─────────────────────────────────────

  setFlow(name, value) {
    this.ctx.flowVars.set(name, value);
  }

  getFlow(name) {
    return this.ctx.flowVars.get(name);
  }

  // ── Persistent variable API ───────────────────────────────

  async setPersistent(scope, name, value) {
    const { guildId, memberId } = this.ctx;
    const strVal = String(value ?? '').slice(0, MAX_PERSIST_LEN);
    const userId = scope === 'user' ? memberId : null;

    await WorkflowVariable.findOneAndUpdate(
      { guildId, userId, key: name },
      { value: strVal, updatedAt: new Date() },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  async getPersistent(scope, name, defaultValue = '') {
    const { guildId, memberId } = this.ctx;
    const userId = scope === 'user' ? memberId : null;

    const record = await WorkflowVariable.findOne({ guildId, userId, key: name }).lean();
    return record ? record.value : defaultValue;
  }

  async incrementPersistent(scope, name, amount = 1) {
    const current = Number(await this.getPersistent(scope, name, '0'));
    const next    = current + Number(amount);
    await this.setPersistent(scope, name, next);
    return next;
  }

  async deletePersistent(scope, name) {
    const { guildId, memberId } = this.ctx;
    const userId = scope === 'user' ? memberId : null;
    await WorkflowVariable.deleteOne({ guildId, userId, key: name });
  }

  // ── Internal: built-in + flow variable lookup ─────────────

  _getValue(key) {
    const ctx = this.ctx;
    const named = ctx.triggerMeta?.argsNamed || {};

    if (Object.prototype.hasOwnProperty.call(named, key)) {
      return named[key];
    }

    // Loop variables (highest priority)
    if (key === 'loop_index' && ctx.currentLoop) return ctx.currentLoop.index;
    if (key === 'loop_count' && ctx.currentLoop) return ctx.currentLoop.count;

    // Built-in Discord context variables
    switch (key) {
      case 'user':         return `<@${ctx.user.id}>`;
      case 'executor':     return `<@${ctx.user.id}>`;
      case 'username':     return ctx.user.username;
      case 'displayname':  return ctx.member.displayName;
      case 'userid':       return ctx.user.id;
      case 'tag':          return ctx.user.tag ?? ctx.user.username;
      case 'avatar':       return ctx.user.displayAvatarURL?.({ size: 256 }) ?? '';
      case 'server':       return ctx.guild.name;
      case 'guild':        return ctx.guild.name;
      case 'serverid':     return ctx.guild.id;
      case 'guildid':      return ctx.guild.id;
      case 'membercount':  return String(ctx.guild.memberCount);
      case 'channel':      return `<#${ctx.channel.id}>`;
      case 'channelname':  return ctx.channel.name;
      case 'channelid':    return ctx.channel.id;
      case 'message':      return ctx.message?.content ?? '';
      case 'reason':       return named.reason ?? '';
      case 'targetUser':
      case 'targetuser':   return named.targetUser ?? named.user ?? '';
      case 'mentioned': {
        // First mentioned user in a message trigger
        if (ctx.message?.mentions?.users?.first()) {
          return `<@${ctx.message.mentions.users.first().id}>`;
        }
        // Slash command option named "user"
        if (ctx.interaction?.options) {
          try {
            const u = ctx.interaction.options.getUser('user', false);
            if (u) return `<@${u.id}>`;
          } catch { /* no option */ }
        }
        return '';
      }
      case 'command_name': return ctx.triggerMeta?.commandName ?? '';
      case 'trigger_value': return ctx.triggerMeta?.matchedValue ?? '';
    }

    // Trigger arguments (arg_0, arg_1, …)
    if (/^arg_\d+$/.test(key)) {
      const idx = parseInt(key.slice(4), 10);
      const args = ctx.triggerMeta?.args ?? [];
      return args[idx] ?? '';
    }

    // Flow variables (set during this execution)
    if (ctx.flowVars.has(key)) return ctx.flowVars.get(key);

    return undefined;
  }
}

module.exports = VariableManager;

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

    // Slash command option lookup: {option.optionName}
    if (key.startsWith('option.')) {
      const optName = key.slice(7);
      const optionsArr = ctx.triggerMeta?.options;
      if (Array.isArray(optionsArr)) {
        const opt = optionsArr.find((o) => o.name === optName);
        if (opt !== undefined) {
          const v = opt.value;
          return v !== undefined && v !== null ? String(v) : '';
        }
      }
      // Also try reading directly from the Discord interaction if available
      if (ctx.interaction?.options) {
        try {
          const val = ctx.interaction.options.get(optName, false);
          if (val !== null) return String(val.value ?? '');
        } catch { /* option not present */ }
      }
      return '';
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

      // ── Date / time ───────────────────────────────────────
      case 'timestamp': return String(Math.floor(Date.now() / 1000));
      case 'date': {
        const now = new Date();
        return now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      }
      case 'time': {
        const now = new Date();
        return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
      }

      // ── Reaction trigger ──────────────────────────────────
      case 'reaction_emoji':    return ctx.triggerMeta?.emoji ?? '';
      case 'reaction_emoji_id': return ctx.triggerMeta?.emojiId ?? ctx.triggerMeta?.emoji ?? '';
      case 'reactor':           return ctx.triggerMeta?.userId ? `<@${ctx.triggerMeta.userId}>` : `<@${ctx.user.id}>`;
      case 'reactor_id':        return ctx.triggerMeta?.userId ?? ctx.user.id;
      case 'reactor_name':      return ctx.triggerMeta?.userName ?? ctx.user.username;
      case 'reacted_message':   return ctx.message?.content ?? '';

      // ── Member join trigger ───────────────────────────────
      case 'new_member':        return `<@${ctx.user.id}>`;
      case 'new_member_id':     return ctx.user.id;
      case 'new_member_name':   return ctx.user.username;
      case 'new_member_avatar': return ctx.user.displayAvatarURL?.({ size: 256 }) ?? '';
      case 'account_age_days': {
        const createdTs = ctx.user.createdTimestamp ?? 0;
        return String(Math.floor((Date.now() - createdTs) / 86_400_000));
      }
      case 'account_created': {
        const d = ctx.user.createdAt ?? new Date(ctx.user.createdTimestamp ?? 0);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      }

      // ── Member leave trigger ──────────────────────────────
      case 'left_member_name': return ctx.triggerMeta?.memberName ?? ctx.user.username;
      case 'left_member_id':   return ctx.triggerMeta?.memberId   ?? ctx.user.id;

      // ── Button interaction trigger ────────────────────────
      case 'button_id':        return ctx.triggerMeta?.buttonId   ?? ctx.interaction?.customId ?? '';
      case 'button_user':      return `<@${ctx.user.id}>`;
      case 'button_user_id':   return ctx.user.id;
      case 'button_user_name': return ctx.user.username;

      // ── Select menu trigger ───────────────────────────────
      case 'selected_values': {
        const vals = ctx.triggerMeta?.selectedValues ?? ctx.interaction?.values ?? [];
        return Array.isArray(vals) ? vals.join(', ') : String(vals);
      }
      case 'selected_count': {
        const vals = ctx.triggerMeta?.selectedValues ?? ctx.interaction?.values ?? [];
        return String(Array.isArray(vals) ? vals.length : 0);
      }

      // ── Modal submit trigger ──────────────────────────────
      case 'modal_1': case 'modal_2': case 'modal_3': case 'modal_4': case 'modal_5': {
        const idx = parseInt(key.slice(6), 10) - 1;
        const fields = ctx.triggerMeta?.modalFields ?? {};
        const values = Object.values(fields);
        return values[idx] ?? '';
      }

      // ── Voice state trigger ───────────────────────────────
      case 'voice_channel':      return ctx.triggerMeta?.channelName ?? '';
      case 'voice_channel_id':   return ctx.triggerMeta?.channelId   ?? '';
      case 'voice_channel_name': return ctx.triggerMeta?.channelName ?? '';

      // ── Scheduled trigger ─────────────────────────────────
      case 'scheduled_name': return ctx.triggerMeta?.scheduledName ?? '';
      case 'scheduled_time': return new Date().toISOString();
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

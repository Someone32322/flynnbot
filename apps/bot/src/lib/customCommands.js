/**
 * customCommands.js — Custom command workflow executor v2
 *
 * Handles: trigger matching, cooldowns, restriction checks, block execution.
 * Security: no eval/Function() for user input, all block types whitelisted at API layer.
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const CustomCommand    = require('../models/CustomCommand');
const WorkflowVariable = require('../models/WorkflowVariable');

// Per-guild command cache (30s TTL)
const cmdCache = new Map();

async function getGuildCommands(guildId) {
  const cached = cmdCache.get(guildId);
  if (cached && Date.now() - cached.ts < 30_000) return cached.cmds;
  const cmds = await CustomCommand.find({ guildId, enabled: true }).lean().catch(() => []);
  cmdCache.set(guildId, { cmds, ts: Date.now() });
  return cmds;
}

function invalidateCommandCache(guildId) {
  cmdCache.delete(guildId);
}

// Per-command cooldown tracking: Map<guildId+commandName+userId, timestamp>
const cooldownMap = new Map();

/**
 * @param {import('discord.js').Message} message
 */
async function handleCustomCommands(message) {
  if (message.author.bot || !message.guild) return;

  const cmds = await getGuildCommands(message.guild.id);
  if (!cmds.length) return;

  const content = message.content;

  for (const cmd of cmds) {
    if (!matchesTrigger(content, cmd)) continue;

    // Channel restriction
    if (cmd.allowedChannels?.length && !cmd.allowedChannels.includes(message.channelId)) continue;

    // Role restriction
    if (cmd.allowedRoles?.length) {
      const memberRoles = message.member.roles.cache.map(r => r.id);
      const hasRole = cmd.allowedRoles.some(rid => memberRoles.includes(rid));
      if (!hasRole) continue;
    }

    // Cooldown
    if (cmd.cooldownSeconds > 0) {
      const key = `${message.guild.id}:${cmd.name}:${message.author.id}`;
      const lastUsed = cooldownMap.get(key) || 0;
      const remaining = (lastUsed + cmd.cooldownSeconds * 1000) - Date.now();
      if (remaining > 0) continue;
      cooldownMap.set(key, Date.now());
    }

    // Delete user message if configured
    if (cmd.deleteUserMessage) {
      message.delete().catch(() => {});
    }

    // Execute blocks (new system) — fall back to legacy if no blocks
    if (Array.isArray(cmd.blocks) && cmd.blocks.length > 0) {
      await executeWorkflow(cmd.blocks, message).catch(() => {});
    } else {
      // Legacy fallback
      const responseText = replacePlaceholders(cmd.response, message);
      if (cmd.type === 'embed') {
        const embed = new EmbedBuilder()
          .setColor(cmd.embedColor || '#0f52ba')
          .setTimestamp();
        if (cmd.embedTitle) embed.setTitle(replacePlaceholders(cmd.embedTitle, message));
        if (cmd.embedDescription) embed.setDescription(replacePlaceholders(cmd.embedDescription, message));
        await message.channel.send({ embeds: [embed] }).catch(() => {});
      } else {
        await message.channel.send({ content: responseText, allowedMentions: { parse: [] } }).catch(() => {});
      }
    }

    // Only process first matching command
    return;
  }
}

function matchesTrigger(content, cmd) {
  const text = cmd.caseSensitive ? content : content.toLowerCase();
  const trigger = cmd.caseSensitive ? cmd.trigger : cmd.trigger.toLowerCase();

  switch (cmd.triggerType) {
    case 'slash':
    case 'prefix':
    case 'exact':      return text === trigger;
    case 'contains':   return text.includes(trigger);
    case 'startsWith': return text.startsWith(trigger);
    case 'regex': {
      try {
        const re = new RegExp(cmd.trigger, cmd.caseSensitive ? '' : 'i');
        return re.test(content);
      } catch { return false; }
    }
    default: return text === trigger;
  }
}

// ── Execution context ─────────────────────────────────────────
function createContext(message) {
  return {
    message,
    guild:     message.guild,
    member:    message.member,
    channel:   message.channel,
    author:    message.author,
    vars:      {},
    stop:      false,
    deadline:  0,        // set by executeWorkflow
    lastMsgId: null,     // ID of last message sent by workflow
  };
}

async function executeWorkflow(blocks, message) {
  const ctx = createContext(message);
  ctx.deadline = Date.now() + 10_000; // 10s hard cap
  for (const block of blocks) {
    if (ctx.stop) break;
    if (Date.now() > ctx.deadline) break;
    await executeBlock(block, ctx).catch(() => {});
  }
}

/**
 * resolveValue — interpolates {varname} and {var:varname} placeholders.
 * User-defined flow vars take precedence over Discord built-ins.
 * Only [a-z0-9_] names are matched — no code executed.
 */
function resolveValue(val, ctx) {
  if (typeof val !== 'string') return String(val ?? '');

  const builtins = {
    user:        () => ctx.author.toString(),
    username:    () => ctx.author.username,
    server:      () => ctx.guild.name,
    channel:     () => ctx.channel.toString(),
    membercount: () => String(ctx.guild.memberCount),
    userid:      () => ctx.author.id,
    tag:         () => ctx.author.tag || ctx.author.username,
    guildid:     () => ctx.guild.id,
    channelid:   () => ctx.channel.id,
  };

  return val
    // explicit {var:name} syntax (backward compat)
    .replace(/\{var:([a-z0-9_]+)\}/gi, (_, name) => String(ctx.vars[name] ?? ''))
    // simple {name} — user flow vars first, then Discord built-ins
    .replace(/\{([a-z0-9_]+)\}/gi, (match, name) => {
      const lc = name.toLowerCase();
      if (name in ctx.vars) return String(ctx.vars[name]);
      if (lc   in ctx.vars) return String(ctx.vars[lc]);
      const fn = builtins[lc];
      return fn ? fn() : match;
    });
}

// ── Condition evaluator ───────────────────────────────────────
async function evaluateCondition(d, ctx) {
  const type = d.condition_type || '';
  // Support both 'compare_value' (dashboard REGISTRY) and legacy 'condition_value'
  const val  = resolveValue(d.compare_value || d.condition_value || '', ctx);

  switch (type) {
    case 'has_role': {
      const roleId = String(d.role_id || '').replace(/\D/g, '');
      return roleId ? !!(ctx.member?.roles.cache.has(roleId)) : false;
    }
    case 'not_has_role': {
      const roleId = String(d.role_id || '').replace(/\D/g, '');
      return roleId ? !(ctx.member?.roles.cache.has(roleId)) : true;
    }
    case 'in_channel':
      return ctx.channel.id === String(d.channel_id || '').replace(/\D/g, '');
    case 'not_in_channel':
      return ctx.channel.id !== String(d.channel_id || '').replace(/\D/g, '');
    case 'var_equals':
      return String(ctx.vars[d.var_name || ''] ?? '') === val;
    case 'var_not_equals':
      return String(ctx.vars[d.var_name || ''] ?? '') !== val;
    case 'var_greater':
      return parseFloat(ctx.vars[d.var_name || ''] ?? 0) > parseFloat(val || 0);
    case 'var_less':
      return parseFloat(ctx.vars[d.var_name || ''] ?? 0) < parseFloat(val || 0);
    case 'is_admin':
      return ctx.member?.permissions.has('Administrator') || false;
    case 'is_mod':
      return (ctx.member?.permissions.has('ModerateMembers') || ctx.member?.permissions.has('BanMembers')) || false;
    case 'message_contains':
      return ctx.message.content.toLowerCase().includes((val || '').toLowerCase());
    case 'user_has_perm': {
      const perm = String(d.permission || '');
      if (!perm) return false;
      try { return !!(ctx.member?.permissions.has(perm)); } catch { return false; }
    }
    case 'user_not_perm': {
      const perm = String(d.permission || '');
      if (!perm) return true;
      try { return !(ctx.member?.permissions.has(perm)); } catch { return true; }
    }
    case 'economy_gte': {
      try {
        const EconomyProfile = require('../models/EconomyProfile');
        const prof = await EconomyProfile.findOne({ guildId: ctx.guild.id, userId: ctx.author.id }).lean();
        const src = d.economy_source === 'bank' ? (prof?.bank ?? 0) : (prof?.wallet ?? prof?.coins ?? 0);
        return src >= parseFloat(val || 0);
      } catch { return false; }
    }
    case 'economy_lt': {
      try {
        const EconomyProfile = require('../models/EconomyProfile');
        const prof = await EconomyProfile.findOne({ guildId: ctx.guild.id, userId: ctx.author.id }).lean();
        const src = d.economy_source === 'bank' ? (prof?.bank ?? 0) : (prof?.wallet ?? prof?.coins ?? 0);
        return src < parseFloat(val || 0);
      } catch { return false; }
    }
    case 'level_gte': {
      try {
        const LevelProfile = require('../models/LevelProfile');
        const prof = await LevelProfile.findOne({ guildId: ctx.guild.id, userId: ctx.author.id }).lean();
        return (prof?.level ?? 0) >= parseFloat(val || 0);
      } catch { return false; }
    }
    case 'arg_equals': {
      const args = ctx.message?.content?.split(/\s+/).slice(1) || [];
      const argIndex = parseInt(d.arg_index || 0);
      return (args[argIndex] || '').toLowerCase() === (val || '').toLowerCase();
    }
    case 'mentioned_user':
      return ctx.message.mentions.users.size > 0;
    default:
      return false;
  }
}

async function executeBlock(block, ctx) {
  if (!block?.type) return;
  const d = block.data || {};
  const { message, guild, member, channel, author } = ctx;
  const rp = (s) => resolveValue(String(s || ''), ctx);

  switch (block.type) {
    case 'reply': {
      const content = rp(d.content).slice(0, 2000);
      if (!content) return;
      const opts = { content, allowedMentions: d.ping_user ? { parse: ['users'] } : { parse: [] } };
      const sent = await message.reply(opts).catch(() => null);
      if (sent) ctx.lastMsgId = sent.id;
      break;
    }
    case 'send_message':
    case 'message': {
      const content = rp(d.content).slice(0, 2000);
      if (!content) return;
      const targetChannel = d.channel_id ? guild.channels.cache.get(String(d.channel_id).replace(/\D/g, '')) : channel;
      const sent = await targetChannel?.send({ content, allowedMentions: { parse: [] } }).catch(() => null);
      if (sent) ctx.lastMsgId = sent.id;
      break;
    }
    case 'dm_user':
    case 'dm': {
      const content = rp(d.content).slice(0, 2000);
      if (!content) return;
      await author.send({ content, allowedMentions: { parse: [] } }).catch(() => {});
      break;
    }
    case 'send_embed':
    case 'embed': {
      const embed = new EmbedBuilder();
      const color = /^#[0-9a-fA-F]{6}$/.test(d.color || '') ? d.color : '#5865f2';
      embed.setColor(color);
      if (d.title)       embed.setTitle(rp(d.title).slice(0, 256));
      if (d.description) embed.setDescription(rp(d.description).slice(0, 4096));
      if (d.footer)      embed.setFooter({ text: rp(d.footer).slice(0, 2048) });
      if (d.thumbnail && /^https?:\/\//i.test(d.thumbnail)) embed.setThumbnail(d.thumbnail);
      if (d.image && /^https?:\/\//i.test(d.image)) embed.setImage(d.image);
      if (d.url && /^https?:\/\//i.test(d.url)) embed.setURL(d.url);
      if (d.timestamp || d.show_timestamp) embed.setTimestamp();
      if (d.show_author || d.showAuthor) embed.setAuthor({ name: author.username, iconURL: author.displayAvatarURL() });
      if (Array.isArray(d.fields) && d.fields.length) {
        embed.addFields(d.fields.slice(0, 25).map(f => ({
          name:   rp(f.name || '\u200b').slice(0, 256),
          value:  rp(f.value || '\u200b').slice(0, 1024),
          inline: !!f.inline,
        })));
      }
      const targetChannel = d.channel_id ? guild.channels.cache.get(String(d.channel_id).replace(/\D/g, '')) : channel;
      const sent = await targetChannel?.send({ embeds: [embed] }).catch(() => null);
      if (sent) ctx.lastMsgId = sent.id;
      break;
    }
    case 'add_role': {
      const roleId = String(d.role_id || d.roleId || '').replace(/\D/g, '');
      if (!roleId || !member) return;
      const role = guild.roles.cache.get(roleId);
      if (!role || role.managed || role.position >= guild.members.me.roles.highest.position) return;
      await member.roles.add(role).catch(() => {});
      break;
    }
    case 'remove_role': {
      const roleId = String(d.role_id || d.roleId || '').replace(/\D/g, '');
      if (!roleId || !member) return;
      const role = guild.roles.cache.get(roleId);
      if (!role || role.managed || role.position >= guild.members.me.roles.highest.position) return;
      await member.roles.remove(role).catch(() => {});
      break;
    }
    case 'toggle_role': {
      const roleId = String(d.role_id || '').replace(/\D/g, '');
      if (!roleId || !member) return;
      const role = guild.roles.cache.get(roleId);
      if (!role || role.managed || role.position >= guild.members.me.roles.highest.position) return;
      if (member.roles.cache.has(roleId)) await member.roles.remove(role).catch(() => {});
      else await member.roles.add(role).catch(() => {});
      break;
    }
    case 'add_reaction':
    case 'react': {
      const emoji = String(d.emoji || '').trim();
      if (!emoji) return;
      await message.react(emoji).catch(() => {});
      break;
    }
    case 'send_buttons': {
      const btns = Array.isArray(d.buttons) ? d.buttons.filter(b => b.label) : [];
      if (!btns.length) return;
      const row = new ActionRowBuilder().addComponents(
        btns.slice(0, 5).map(btn => {
          const style = { Primary: ButtonStyle.Primary, Secondary: ButtonStyle.Secondary, Success: ButtonStyle.Success, Danger: ButtonStyle.Danger, Link: ButtonStyle.Link }[btn.style] || ButtonStyle.Primary;
          const b = new ButtonBuilder().setLabel(rp(btn.label).slice(0, 80)).setStyle(style);
          if (style === ButtonStyle.Link) b.setURL(rp(btn.customId || btn.url || '').slice(0, 512));
          else b.setCustomId(rp(btn.customId || btn.label).slice(0, 100));
          return b;
        })
      );
      const msgContent = rp(d.message || '').slice(0, 2000) || undefined;
      const targetChannel = d.channel_id ? guild.channels.cache.get(String(d.channel_id).replace(/\D/g,'')) : channel;
      const sent = await targetChannel?.send({ content: msgContent, components: [row], allowedMentions: { parse: [] } }).catch(() => null);
      if (sent) ctx.lastMsgId = sent.id;
      break;
    }
    case 'send_select_menu': {
      const opts = Array.isArray(d.options) ? d.options.filter(o => o.label || o.value) : [];
      if (!opts.length) return;
      const menu = new StringSelectMenuBuilder()
        .setCustomId('cc_menu_' + Date.now())
        .setPlaceholder(rp(d.placeholder || 'Choose an option').slice(0, 150))
        .setMinValues(Math.max(1, parseInt(d.min_values) || 1))
        .setMaxValues(Math.min(25, parseInt(d.max_values) || 1))
        .addOptions(opts.slice(0, 25).map(o => ({
          label:       rp(o.label || 'Option').slice(0, 100),
          value:       rp(o.value || o.label || 'value').slice(0, 100),
          description: o.description ? rp(o.description).slice(0, 100) : undefined,
        })));
      const row = new ActionRowBuilder().addComponents(menu);
      const targetChannel = d.channel_id ? guild.channels.cache.get(String(d.channel_id).replace(/\D/g,'')) : channel;
      const msgContent = rp(d.message || '').slice(0, 2000) || undefined;
      const sent = await targetChannel?.send({ content: msgContent, components: [row], allowedMentions: { parse: [] } }).catch(() => null);
      if (sent) ctx.lastMsgId = sent.id;
      break;
    }
    // ── ECONOMY ─────────────────────────────────────────────

    case 'give_coins': {
      const amount = Math.max(0, Math.min(1000000, parseInt(d.amount) || 0));
      if (!amount) return;
      const to    = d.to === 'target' ? message.mentions.users.first()?.id || author.id : author.id;
      const field = d.location === 'bank' ? 'bank' : 'wallet';
      try {
        const EconomyProfile = require('../models/EconomyProfile');
        await EconomyProfile.findOneAndUpdate(
          { guildId: guild.id, userId: to },
          { $inc: { [field]: amount, coins: field === 'wallet' ? amount : 0 } },
          { upsert: true }
        );
      } catch {}
      break;
    }
    case 'take_coins': {
      const amount = Math.max(0, Math.min(1000000, parseInt(d.amount) || 0));
      if (!amount) return;
      const from  = d.from === 'target' ? message.mentions.users.first()?.id || author.id : author.id;
      const field = d.location === 'bank' ? 'bank' : 'wallet';
      try {
        const EconomyProfile = require('../models/EconomyProfile');
        await EconomyProfile.findOneAndUpdate(
          { guildId: guild.id, userId: from },
          { $inc: { [field]: -amount, coins: field === 'wallet' ? -amount : 0 } },
          { upsert: true }
        );
      } catch {}
      break;
    }
    case 'set_coins':
    case 'set_balance': {
      const amount = Math.max(0, Math.min(1000000, parseInt(d.amount) || 0));
      const field  = d.location === 'bank' ? 'bank' : 'wallet';
      try {
        const EconomyProfile = require('../models/EconomyProfile');
        await EconomyProfile.findOneAndUpdate(
          { guildId: guild.id, userId: author.id },
          { $set: { [field]: amount, coins: field === 'wallet' ? amount : undefined } },
          { upsert: true }
        );
      } catch {}
      break;
    }
    case 'check_balance':
    case 'check_coins': {
      try {
        const EconomyProfile = require('../models/EconomyProfile');
        const prof = await EconomyProfile.findOne({ guildId: guild.id, userId: author.id }).lean();
        if (block.type === 'check_balance') {
          const walletVar = String(d.var_wallet || 'wallet').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
          const bankVar   = String(d.var_bank   || 'bank').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
          ctx.vars[walletVar] = String(prof?.wallet ?? prof?.coins ?? 0);
          ctx.vars[bankVar]   = String(prof?.bank ?? 0);
        } else {
          const storeAs = String(d.store_as || 'coins').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
          ctx.vars[storeAs] = String(prof?.coins ?? prof?.wallet ?? 0);
        }
      } catch {}
      break;
    }
    case 'give_item': {
      const itemId   = String(d.item_id   || '').slice(0, 64);
      const itemName = String(d.item_name || '').slice(0, 64);
      if (!itemId || !itemName) return;
      try {
        const Inventory = require('../models/Inventory');
        await Inventory.findOneAndUpdate(
          { guildId: guild.id, userId: author.id, itemId },
          { $inc: { quantity: Math.max(1, parseInt(d.quantity) || 1) }, $set: { itemName, emoji: d.emoji || '📦' } },
          { upsert: true }
        );
      } catch {}
      break;
    }

    // ── LEVELING ─────────────────────────────────────────────

    case 'give_xp': {
      const amount = Math.max(0, Math.min(100000, parseInt(d.amount) || 0));
      if (!amount) return;
      try {
        const LevelProfile = require('../models/LevelProfile');
        await LevelProfile.findOneAndUpdate(
          { guildId: guild.id, userId: author.id },
          { $inc: { xp: amount } },
          { upsert: true }
        );
      } catch {}
      break;
    }
    case 'take_xp': {
      const amount = Math.max(0, Math.min(100000, parseInt(d.amount) || 0));
      if (!amount) return;
      try {
        const LevelProfile = require('../models/LevelProfile');
        await LevelProfile.findOneAndUpdate(
          { guildId: guild.id, userId: author.id },
          { $inc: { xp: -amount } },
          { upsert: true }
        );
      } catch {}
      break;
    }
    case 'get_level':
    case 'check_level':
    case 'check_xp': {
      try {
        const LevelProfile = require('../models/LevelProfile');
        const prof = await LevelProfile.findOne({ guildId: guild.id, userId: author.id }).lean();
        if (block.type === 'get_level') {
          const lvlVar = String(d.var_level || 'level').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
          const xpVar  = String(d.var_xp   || 'xp').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
          ctx.vars[lvlVar] = String(prof?.level ?? 0);
          ctx.vars[xpVar]  = String(prof?.xp ?? 0);
        } else if (block.type === 'check_level') {
          const storeAs = String(d.store_as || 'level').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
          ctx.vars[storeAs] = String(prof?.level ?? 0);
        } else {
          const storeAs = String(d.store_as || 'xp').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
          ctx.vars[storeAs] = String(prof?.xp ?? 0);
        }
      } catch {}
      break;
    }

    // ── VARIABLES ───────────────────────────────────────────

    case 'set_variable': {
      const name  = String(d.var_name || '').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      if (!name) return;
      const value = rp(d.value || '');
      const scope = d.scope || 'flow';
      if (scope === 'flow') {
        ctx.vars[name] = value;
      } else {
        const userId = scope === 'user' ? author.id : null;
        await WorkflowVariable.findOneAndUpdate(
          { guildId: guild.id, userId, key: name },
          { $set: { value: value.slice(0, 500) } },
          { upsert: true }
        ).catch(() => {});
        ctx.vars[name] = value;
      }
      break;
    }
    case 'get_variable': {
      const name    = String(d.var_name || '').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      if (!name) return;
      const scope   = d.scope || 'user';
      const defVal  = rp(d.default_value ?? '0');
      const storeAs = String(d.store_as || name).replace(/[^a-z0-9_]/gi, '').slice(0, 32) || name;
      const userId  = scope === 'user' ? author.id : null;
      try {
        const record = await WorkflowVariable.findOne({ guildId: guild.id, userId, key: name }).lean();
        ctx.vars[storeAs] = record ? record.value : defVal;
      } catch {
        ctx.vars[storeAs] = defVal;
      }
      break;
    }
    case 'increment_variable': {
      const name  = String(d.var_name || '').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      if (!name) return;
      const amount = Math.max(-99999, Math.min(99999, parseFloat(d.amount) || 1));
      const scope  = d.scope || 'user';
      const userId = scope === 'user' ? author.id : null;
      try {
        const current = await WorkflowVariable.findOne({ guildId: guild.id, userId, key: name }).lean();
        const newVal  = String((parseFloat(current?.value || '0') || 0) + amount);
        await WorkflowVariable.findOneAndUpdate(
          { guildId: guild.id, userId, key: name },
          { $set: { value: newVal } },
          { upsert: true }
        );
        ctx.vars[name] = newVal;
      } catch {}
      break;
    }
    case 'delete_variable': {
      const name  = String(d.var_name || '').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      if (!name) return;
      const scope  = d.scope || 'user';
      const userId = scope === 'user' ? author.id : null;
      await WorkflowVariable.deleteOne({ guildId: guild.id, userId, key: name }).catch(() => {});
      delete ctx.vars[name];
      break;
    }
    case 'random_number': {
      const mn = parseInt(d.min ?? 1), mx = parseInt(d.max ?? 100);
      const result  = Math.floor(Math.random() * (Math.max(mn, mx) - Math.min(mn, mx) + 1)) + Math.min(mn, mx);
      const storeAs = String(d.store_as || 'random').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      ctx.vars[storeAs] = String(result);
      break;
    }
    case 'random_choice': {
      const choices = String(d.choices || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!choices.length) return;
      const pick    = choices[Math.floor(Math.random() * choices.length)];
      const storeAs = String(d.store_as || 'choice').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      ctx.vars[storeAs] = pick;
      break;
    }

    // ── UTILITY ─────────────────────────────────────────────

    case 'math': {
      const expr    = String(d.expression || '').slice(0, 200).replace(/[^0-9+\-*/().\s]/g, '');
      const storeAs = String(d.store_as || 'result').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      try {
        // eslint-disable-next-line no-new-func
        const result = Function('"use strict"; return (' + expr + ')')();
        if (typeof result === 'number' && isFinite(result)) ctx.vars[storeAs] = String(result);
      } catch {}
      break;
    }
    case 'format_text': {
      const storeAs = String(d.store_as || 'formatted').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      ctx.vars[storeAs] = rp(d.template || '').slice(0, 2000);
      break;
    }
    case 'string_operation': {
      const text    = rp(d.text || '');
      const storeAs = String(d.store_as || 'result').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      let result = text;
      switch (d.operation || 'uppercase') {
        case 'uppercase': result = text.toUpperCase(); break;
        case 'lowercase': result = text.toLowerCase(); break;
        case 'trim':      result = text.trim(); break;
        case 'reverse':   result = [...text].reverse().join(''); break;
        case 'length':    result = String(text.length); break;
        case 'replace': {
          const find = String(d.find || '').slice(0, 100);
          const rep  = String(d.replace_with || '').slice(0, 100);
          if (find) result = text.split(find).join(rep);
          break;
        }
        case 'contains': {
          const needle = String(d.search || '').slice(0, 200);
          result = text.toLowerCase().includes(needle.toLowerCase()) ? 'true' : 'false';
          break;
        }
      }
      ctx.vars[storeAs] = result.slice(0, 500);
      break;
    }
    case 'fetch_user_info': {
      const prefix = String(d.var_prefix || 'target').replace(/[^a-z0-9_]/gi, '').slice(0, 20);
      const targetUser   = d.target === 'mentioned' ? message.mentions.users.first()   : author;
      const targetMember = d.target === 'mentioned' ? message.mentions.members?.first() : member;
      if (targetUser) {
        ctx.vars[`${prefix}_id`]       = targetUser.id;
        ctx.vars[`${prefix}_username`] = targetUser.username;
        ctx.vars[`${prefix}_tag`]      = targetUser.tag || targetUser.username;
        ctx.vars[`${prefix}_created`]  = targetUser.createdAt.toLocaleDateString();
        ctx.vars[`${prefix}_avatar`]   = targetUser.displayAvatarURL();
        ctx.vars[prefix]               = targetUser.toString();
      }
      if (targetMember) {
        ctx.vars[`${prefix}_joined`]   = targetMember.joinedAt?.toLocaleDateString() || 'Unknown';
        ctx.vars[`${prefix}_nickname`] = targetMember.nickname || targetUser?.username || '';
        ctx.vars[`${prefix}_roles`]    = targetMember.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name).join(', ');
      }
      break;
    }
    case 'log_to_channel': {
      const targetChannel = d.channel_id ? guild.channels.cache.get(String(d.channel_id).replace(/\D/g, '')) : null;
      if (!targetChannel) return;
      const content = rp(d.message || d.content || 'Log entry').slice(0, 2000);
      if (d.as_embed) {
        const embed = new EmbedBuilder()
          .setDescription(content)
          .setColor(d.embed_color && /^#[0-9a-fA-F]{6}$/.test(d.embed_color) ? d.embed_color : '#5865f2')
          .setTimestamp();
        await targetChannel.send({ embeds: [embed] }).catch(() => {});
      } else {
        await targetChannel.send({ content, allowedMentions: { parse: [] } }).catch(() => {});
      }
      break;
    }

    // ── MODERATION ──────────────────────────────────────────

    case 'timeout_user': {
      if (!member || !guild.members.me.permissions.has('ModerateMembers')) return;
      const durationMin = Math.max(1, Math.min(40320, parseInt(d.duration_min) || 10));
      const reason = rp(d.reason || 'Timed out by custom command').slice(0, 512);
      if (member.roles.highest.position >= guild.members.me.roles.highest.position) return;
      await member.timeout(durationMin * 60 * 1000, reason).catch(() => {});
      break;
    }
    case 'mute_user':
    case 'unmute_user': {
      if (!member || !guild.members.me.permissions.has('ModerateMembers')) return;
      if (member.roles.highest.position >= guild.members.me.roles.highest.position) return;
      await member.timeout(block.type === 'unmute_user' ? null : 60 * 1000).catch(() => {});
      break;
    }
    case 'kick_user': {
      if (!member || !guild.members.me.permissions.has('KickMembers')) return;
      if (member.roles.highest.position >= guild.members.me.roles.highest.position) return;
      const reason = rp(d.reason || 'Kicked by custom command').slice(0, 512);
      if (d.dm_user) await author.send({ content: `You have been kicked from **${guild.name}**. Reason: ${reason}` }).catch(() => {});
      await member.kick(reason).catch(() => {});
      break;
    }
    case 'ban_user': {
      if (!member || !guild.members.me.permissions.has('BanMembers')) return;
      if (member.roles.highest.position >= guild.members.me.roles.highest.position) return;
      const reason = rp(d.reason || 'Banned by custom command').slice(0, 512);
      const delDays = Math.max(0, Math.min(7, parseInt(d.delete_days) || 0));
      if (d.dm_user) await author.send({ content: `You have been banned from **${guild.name}**. Reason: ${reason}` }).catch(() => {});
      await guild.members.ban(author.id, { reason, deleteMessageSeconds: delDays * 86400 }).catch(() => {});
      break;
    }
    case 'warn_user': {
      const reason = rp(d.reason || 'Warned by custom command').slice(0, 512);
      try {
        const ModerationCase = require('../models/ModerationCase');
        await ModerationCase.create({ guildId: guild.id, userId: author.id, moderatorId: guild.members.me.id, action: 'warn', reason, createdAt: new Date() });
      } catch {}
      if (d.dm_user) await author.send({ content: `You have received a warning in **${guild.name}**. Reason: ${reason}` }).catch(() => {});
      break;
    }
    case 'purge_messages': {
      if (!guild.members.me.permissions.has('ManageMessages')) return;
      const count  = Math.max(1, Math.min(100, parseInt(d.count) || 5));
      const filter = d.filter || 'all';
      try {
        const fetched  = await channel.messages.fetch({ limit: Math.min(count + 5, 100) });
        let toDelete = fetched.filter(m => m.id !== message.id);
        if (filter === 'bots') toDelete = toDelete.filter(m => m.author.bot);
        else if (filter === 'user') toDelete = toDelete.filter(m => m.author.id === author.id);
        const arr = [...toDelete.values()].slice(0, count);
        if (arr.length) await channel.bulkDelete(arr, true).catch(() => {});
      } catch {}
      break;
    }
    case 'delete_message': {
      const target = d.target || 'trigger';
      if (target === 'trigger') {
        await message.delete().catch(() => {});
      } else if (target === 'bot_last' && ctx.lastMsgId) {
        try {
          const m = await channel.messages.fetch(ctx.lastMsgId);
          if (m?.deletable) await m.delete();
        } catch {}
      } else if (target === 'by_id') {
        const id = rp(d.message_id_var || '').replace(/\D/g, '');
        if (id) { try { const m = await channel.messages.fetch(id); if (m?.deletable) await m.delete(); } catch {} }
      }
      break;
    }
    case 'pin_message': {
      if (guild.members.me.permissions.has('ManageMessages')) {
        await message.pin().catch(() => {});
      }
      break;
    }
    case 'set_nickname': {
      if (!member) return;
      const nick = rp(d.nickname || '').slice(0, 32);
      await member.setNickname(nick || null, 'Changed by custom command').catch(() => {});
      break;
    }

    // ── CHANNELS ────────────────────────────────────────────

    case 'create_thread': {
      if (!channel.isTextBased() || !channel.threads) return;
      if (!guild.members.me.permissions.has('CreatePublicThreads')) return;
      const threadName = rp(d.name || 'Thread').slice(0, 100);
      const archive    = [60, 1440, 4320, 10080].includes(parseInt(d.auto_archive_min)) ? parseInt(d.auto_archive_min) : 1440;
      await channel.threads.create({ name: threadName, autoArchiveDuration: archive, reason: 'Created by custom command' }).catch(() => {});
      break;
    }
    case 'lock_channel': {
      const targetChannel = d.channel_id ? guild.channels.cache.get(String(d.channel_id).replace(/\D/g, '')) : channel;
      if (!targetChannel?.isTextBased()) return;
      if (!guild.members.me.permissions.has('ManageChannels')) return;
      const slowmode = Math.max(0, Math.min(21600, parseInt(d.slowmode_seconds) || 0));
      await targetChannel.setRateLimitPerUser(slowmode, 'Set by custom command').catch(() => {});
      break;
    }

    // ── FLOW CONTROL ────────────────────────────────────────

    case 'condition_if': {
      const condResult = await evaluateCondition(d, ctx);
      const branchBlocks = condResult ? (d.if_blocks || []) : (d.else_blocks || []);
      for (const bb of branchBlocks) {
        if (ctx.stop) break;
        if (ctx.deadline && Date.now() > ctx.deadline) break;
        await executeBlock(bb, ctx).catch(() => {});
      }
      break;
    }
    case 'stop_if': {
      const stopResult = await evaluateCondition(d, ctx);
      if (stopResult) {
        if (d.reply_msg) {
          const msg = rp(d.reply_msg).slice(0, 2000);
          if (msg) await message.reply({ content: msg, allowedMentions: { parse: [] } }).catch(() => {});
        }
        ctx.stop = true;
      }
      break;
    }
    case 'loop_times': {
      const times      = Math.max(1, Math.min(10, parseInt(d.times) || 2));
      const loopBlocks = Array.isArray(d.loop_blocks) ? d.loop_blocks : [];
      if (!loopBlocks.length) return;
      for (let i = 0; i < times; i++) {
        if (ctx.stop) break;
        if (ctx.deadline && Date.now() > ctx.deadline) break;
        ctx.vars['loop_index'] = String(i);
        ctx.vars['loop_count'] = String(i + 1);
        for (const bb of loopBlocks) {
          if (ctx.stop) break;
          if (ctx.deadline && Date.now() > ctx.deadline) break;
          await executeBlock(bb, ctx).catch(() => {});
        }
      }
      break;
    }
    case 'delay':
    case 'wait': {
      const ms = Math.min(10000, Math.max(100, parseInt(d.ms) || 1000));
      await new Promise(r => setTimeout(r, ms));
      break;
    }
    case 'stop_flow': {
      ctx.stop = true;
      break;
    }

    // Unknown block types are silently skipped
    default: break;
  }
}

function replacePlaceholders(text, message) {
  return String(text || '')
    .replace(/\{user\}/gi, message.author.toString())
    .replace(/\{username\}/gi, message.author.username)
    .replace(/\{server\}/gi, message.guild.name)
    .replace(/\{channel\}/gi, message.channel.toString())
    .replace(/\{membercount\}/gi, String(message.guild.memberCount))
    .replace(/\{userid\}/gi, message.author.id)
    .replace(/\{tag\}/gi, message.author.tag || message.author.username);
}

module.exports = { handleCustomCommands, invalidateCommandCache };

/**
 * customCommands.js — Custom command handler
 * Called from messageCreate event. Checks message against server custom commands.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const CustomCommand = require('../models/CustomCommand');

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
    guild: message.guild,
    member: message.member,
    channel: message.channel,
    author: message.author,
    vars: {},
    stop: false,
  };
}

async function executeWorkflow(blocks, message) {
  const ctx = createContext(message);
  const deadline = Date.now() + 10_000; // 10s cap
  for (const block of blocks) {
    if (ctx.stop) break;
    if (Date.now() > deadline) break;
    await executeBlock(block, ctx).catch(() => {});
  }
}

function resolveValue(val, ctx) {
  if (typeof val !== 'string') return String(val ?? '');
  return val.replace(/\{var:([a-z0-9_]+)\}/gi, (_, name) => String(ctx.vars[name] ?? ''))
            .replace(/\{user\}/gi, ctx.author.toString())
            .replace(/\{username\}/gi, ctx.author.username)
            .replace(/\{server\}/gi, ctx.guild.name)
            .replace(/\{channel\}/gi, ctx.channel.toString())
            .replace(/\{membercount\}/gi, String(ctx.guild.memberCount))
            .replace(/\{userid\}/gi, ctx.author.id)
            .replace(/\{tag\}/gi, ctx.author.tag || ctx.author.username);
}

async function evaluateCondition(d, ctx) {
  const type = d.condition_type || '';
  const val = resolveValue(d.condition_value || '', ctx);
  switch (type) {
    case 'has_role': {
      const roleId = String(d.role_id || '').replace(/\D/g, '');
      return roleId ? ctx.member?.roles.cache.has(roleId) : false;
    }
    case 'not_has_role': {
      const roleId = String(d.role_id || '').replace(/\D/g, '');
      return roleId ? !ctx.member?.roles.cache.has(roleId) : true;
    }
    case 'in_channel': return ctx.channel.id === String(d.channel_id || '').replace(/\D/g, '');
    case 'var_equals': return String(ctx.vars[d.var_name || ''] ?? '') === val;
    case 'var_greater': return parseFloat(ctx.vars[d.var_name || ''] ?? 0) > parseFloat(val || 0);
    case 'var_less': return parseFloat(ctx.vars[d.var_name || ''] ?? 0) < parseFloat(val || 0);
    case 'is_admin': return ctx.member?.permissions.has('Administrator') || false;
    case 'is_mod': return (ctx.member?.permissions.has('ModerateMembers') || ctx.member?.permissions.has('BanMembers')) || false;
    case 'message_contains': return ctx.message.content.toLowerCase().includes((val || '').toLowerCase());
    default: return false;
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
      await message.reply({ content, allowedMentions: { parse: [] } });
      break;
    }
    case 'send_message':
    case 'message': {
      const content = rp(d.content).slice(0, 2000);
      if (!content) return;
      const targetChannel = d.channel_id ? guild.channels.cache.get(d.channel_id) : channel;
      await targetChannel?.send({ content, allowedMentions: { parse: [] } });
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
      if (d.title) embed.setTitle(rp(d.title).slice(0, 256));
      if (d.description) embed.setDescription(rp(d.description).slice(0, 4096));
      if (d.footer) embed.setFooter({ text: rp(d.footer).slice(0, 2048) });
      if (d.thumbnail && /^https?:\/\//i.test(d.thumbnail)) embed.setThumbnail(d.thumbnail);
      if (d.image && /^https?:\/\//i.test(d.image)) embed.setImage(d.image);
      if (d.timestamp) embed.setTimestamp();
      if (d.showAuthor) embed.setAuthor({ name: author.username, iconURL: author.displayAvatarURL() });
      if (Array.isArray(d.fields) && d.fields.length) {
        embed.addFields(d.fields.slice(0, 25).map(f => ({
          name:   rp(f.name || '\u200b').slice(0, 256),
          value:  rp(f.value || '\u200b').slice(0, 1024),
          inline: !!f.inline,
        })));
      }
      const targetChannel = d.channel_id ? guild.channels.cache.get(d.channel_id) : channel;
      await targetChannel?.send({ embeds: [embed] });
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
          if (style === ButtonStyle.Link) b.setURL(rp(btn.customId).slice(0, 512));
          else b.setCustomId(rp(btn.customId || btn.label).slice(0, 100));
          return b;
        })
      );
      const msgContent = rp(d.message || '').slice(0, 2000) || undefined;
      const targetChannel = d.channel_id ? guild.channels.cache.get(d.channel_id) : channel;
      await targetChannel?.send({ content: msgContent, components: [row], allowedMentions: { parse: [] } });
      break;
    }
    case 'send_select_menu': {
      const opts = Array.isArray(d.options) ? d.options.filter(o => o.label || o.value) : [];
      if (!opts.length) return;
      const menu = new StringSelectMenuBuilder()
        .setCustomId('cc_menu_' + Date.now())
        .setPlaceholder(rp(d.placeholder || 'Choose an option').slice(0, 150))
        .addOptions(opts.slice(0, 25).map(o => ({
          label: rp(o.label || 'Option').slice(0, 100),
          value: rp(o.value || o.label || 'value').slice(0, 100),
          description: o.description ? rp(o.description).slice(0, 100) : undefined,
        })));
      const row = new ActionRowBuilder().addComponents(menu);
      const targetChannel = d.channel_id ? guild.channels.cache.get(d.channel_id) : channel;
      const msgContent = rp(d.message || '').slice(0, 2000) || undefined;
      await targetChannel?.send({ content: msgContent, components: [row], allowedMentions: { parse: [] } });
      break;
    }
    case 'give_coins': {
      const amount = Math.max(0, Math.min(1000000, parseInt(d.amount)||0));
      if (!amount) return;
      try {
        const EconomyProfile = require('../models/EconomyProfile');
        await EconomyProfile.findOneAndUpdate(
          { guildId: guild.id, userId: author.id },
          { $inc: { coins: amount } },
          { upsert: true, new: true }
        );
      } catch {}
      break;
    }
    case 'take_coins': {
      const amount = Math.max(0, Math.min(1000000, parseInt(d.amount)||0));
      if (!amount) return;
      try {
        const EconomyProfile = require('../models/EconomyProfile');
        await EconomyProfile.findOneAndUpdate(
          { guildId: guild.id, userId: author.id },
          { $inc: { coins: -amount } },
          { upsert: true }
        );
      } catch {}
      break;
    }
    case 'set_coins': {
      const amount = Math.max(0, Math.min(1000000, parseInt(d.amount)||0));
      try {
        const EconomyProfile = require('../models/EconomyProfile');
        await EconomyProfile.findOneAndUpdate(
          { guildId: guild.id, userId: author.id },
          { $set: { coins: amount } },
          { upsert: true }
        );
      } catch {}
      break;
    }
    case 'give_xp': {
      const amount = Math.max(0, Math.min(100000, parseInt(d.amount)||0));
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
      const amount = Math.max(0, Math.min(100000, parseInt(d.amount)||0));
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
    case 'set_variable': {
      const name = String(d.var_name || '').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      if (!name) return;
      ctx.vars[name] = rp(d.value || '');
      break;
    }
    case 'math': {
      const expr = String(d.expression || '').slice(0, 200).replace(/[^0-9+\-*/().\s]/g, '');
      const storeName = String(d.store_as || 'result').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      try {
        // eslint-disable-next-line no-eval
        const result = Function('"use strict"; return (' + expr + ')')();
        if (typeof result === 'number' && isFinite(result)) ctx.vars[storeName] = String(result);
      } catch {}
      break;
    }
    case 'random_number': {
      const min2 = parseInt(d.min ?? 1); const max2 = parseInt(d.max ?? 100);
      const result = Math.floor(Math.random() * (max2 - min2 + 1)) + min2;
      const storeName = String(d.store_as || 'random').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      ctx.vars[storeName] = String(result);
      break;
    }
    case 'random_choice': {
      const choices = String(d.choices || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!choices.length) return;
      const pick = choices[Math.floor(Math.random() * choices.length)];
      const storeName = String(d.store_as || 'choice').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      ctx.vars[storeName] = pick;
      break;
    }
    case 'delay': {
      const ms = Math.min(10000, Math.max(100, parseInt(d.ms)||1000));
      await new Promise(r => setTimeout(r, ms));
      break;
    }
    case 'log_to_channel': {
      const targetChannel = d.channel_id ? guild.channels.cache.get(String(d.channel_id).replace(/\D/g,'')) : null;
      if (!targetChannel) return;
      const content = rp(d.content || 'Log entry').slice(0, 2000);
      await targetChannel.send({ content, allowedMentions: { parse: [] } }).catch(() => {});
      break;
    }
    case 'timeout_user': {
      if (!member || !guild.members.me.permissions.has('ModerateMembers')) return;
      const durationMin = Math.max(1, Math.min(40320, parseInt(d.duration_min)||10));
      const reason = rp(d.reason || 'Timed out by custom command').slice(0, 512);
      if (member.roles.highest.position >= guild.members.me.roles.highest.position) return;
      await member.timeout(durationMin * 60 * 1000, reason).catch(() => {});
      break;
    }
    case 'kick_user': {
      if (!member || !guild.members.me.permissions.has('KickMembers')) return;
      if (member.roles.highest.position >= guild.members.me.roles.highest.position) return;
      const reason = rp(d.reason || 'Kicked by custom command').slice(0, 512);
      await member.kick(reason).catch(() => {});
      break;
    }
    case 'ban_user': {
      if (!member || !guild.members.me.permissions.has('BanMembers')) return;
      if (member.roles.highest.position >= guild.members.me.roles.highest.position) return;
      const reason = rp(d.reason || 'Banned by custom command').slice(0, 512);
      await guild.members.ban(author.id, { reason, deleteMessageSeconds: 0 }).catch(() => {});
      break;
    }
    case 'warn_user': {
      const reason = rp(d.reason || 'Warned by custom command').slice(0, 512);
      try {
        const ModerationCase = require('../models/ModerationCase');
        await ModerationCase.create({
          guildId: guild.id, userId: author.id, moderatorId: guild.members.me.id,
          action: 'warn', reason, createdAt: new Date(),
        });
      } catch {}
      break;
    }
    case 'delete_message': {
      await message.delete().catch(() => {});
      break;
    }
    case 'pin_message': {
      if (guild.members.me.permissions.has('ManageMessages')) {
        await message.pin().catch(() => {});
      }
      break;
    }
    case 'set_nickname': {
      const nick = rp(d.nickname || '').slice(0, 32);
      if (!member) return;
      await member.setNickname(nick || null).catch(() => {});
      break;
    }
    case 'condition_if': {
      const result = await evaluateCondition(d, ctx);
      const branchBlocks = result ? (d.if_blocks || []) : (d.else_blocks || []);
      for (const bb of branchBlocks) {
        if (ctx.stop) break;
        await executeBlock(bb, ctx).catch(() => {});
      }
      break;
    }
    case 'stop_if': {
      const result = await evaluateCondition(d, ctx);
      if (result) ctx.stop = true;
      break;
    }
    case 'stop_flow': {
      ctx.stop = true;
      break;
    }
    case 'check_coins': {
      try {
        const EconomyProfile = require('../models/EconomyProfile');
        const profile = await EconomyProfile.findOne({ guildId: guild.id, userId: author.id }).lean();
        const storeName = String(d.store_as || 'coins').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
        ctx.vars[storeName] = String(profile?.coins ?? 0);
      } catch {}
      break;
    }
    case 'check_level': {
      try {
        const LevelProfile = require('../models/LevelProfile');
        const profile = await LevelProfile.findOne({ guildId: guild.id, userId: author.id }).lean();
        const storeName = String(d.store_as || 'level').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
        ctx.vars[storeName] = String(profile?.level ?? 0);
      } catch {}
      break;
    }
    case 'check_xp': {
      try {
        const LevelProfile = require('../models/LevelProfile');
        const profile = await LevelProfile.findOne({ guildId: guild.id, userId: author.id }).lean();
        const storeName = String(d.store_as || 'xp').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
        ctx.vars[storeName] = String(profile?.xp ?? 0);
      } catch {}
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

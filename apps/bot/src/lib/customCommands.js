/**
 * customCommands.js — Custom command handler
 * Called from messageCreate event. Checks message against server custom commands.
 */

const { EmbedBuilder } = require('discord.js');
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
      for (const block of cmd.blocks) {
        await executeBlock(block, message).catch(() => {});
      }
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

// Whitelisted block types for execution security
const SAFE_BLOCK_TYPES = new Set(['reply', 'message', 'embed', 'dm', 'add_role', 'remove_role', 'react']);

async function executeBlock(block, message) {
  if (!block?.type || !SAFE_BLOCK_TYPES.has(block.type)) return;
  const d = block.data || {};
  const { EmbedBuilder } = require('discord.js');

  switch (block.type) {
    case 'reply': {
      const content = replacePlaceholders(String(d.content || ''), message).slice(0, 2000);
      if (!content) return;
      await message.reply({ content, allowedMentions: { parse: [] } });
      break;
    }
    case 'message': {
      const content = replacePlaceholders(String(d.content || ''), message).slice(0, 2000);
      if (!content) return;
      await message.channel.send({ content, allowedMentions: { parse: [] } });
      break;
    }
    case 'dm': {
      const content = replacePlaceholders(String(d.content || ''), message).slice(0, 2000);
      if (!content) return;
      await message.author.send({ content, allowedMentions: { parse: [] } }).catch(() => {});
      break;
    }
    case 'embed': {
      const embed = new EmbedBuilder();
      const color = /^#[0-9a-fA-F]{6}$/.test(d.color || '') ? d.color : '#5865f2';
      embed.setColor(color);
      if (d.title) embed.setTitle(replacePlaceholders(String(d.title), message).slice(0, 256));
      if (d.description) embed.setDescription(replacePlaceholders(String(d.description), message).slice(0, 4096));
      if (d.footer) embed.setFooter({ text: replacePlaceholders(String(d.footer), message).slice(0, 2048) });
      if (d.thumbnail && /^https?:\/\//i.test(d.thumbnail)) embed.setThumbnail(d.thumbnail);
      if (d.image && /^https?:\/\//i.test(d.image)) embed.setImage(d.image);
      if (d.timestamp) embed.setTimestamp();
      if (d.showAuthor) embed.setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() });
      if (Array.isArray(d.fields) && d.fields.length) {
        embed.addFields(d.fields.slice(0, 25).map(f => ({
          name:   replacePlaceholders(String(f.name || '\u200b'), message).slice(0, 256),
          value:  replacePlaceholders(String(f.value || '\u200b'), message).slice(0, 1024),
          inline: !!f.inline,
        })));
      }
      await message.channel.send({ embeds: [embed] });
      break;
    }
    case 'add_role': {
      const roleId = String(d.roleId || '').replace(/\D/g, '');
      if (!roleId || !message.member) return;
      const role = message.guild.roles.cache.get(roleId);
      if (!role || role.managed || role.position >= message.guild.members.me.roles.highest.position) return;
      await message.member.roles.add(role).catch(() => {});
      break;
    }
    case 'remove_role': {
      const roleId = String(d.roleId || '').replace(/\D/g, '');
      if (!roleId || !message.member) return;
      const role = message.guild.roles.cache.get(roleId);
      if (!role || role.managed || role.position >= message.guild.members.me.roles.highest.position) return;
      await message.member.roles.remove(role).catch(() => {});
      break;
    }
    case 'react': {
      const emoji = String(d.emoji || '').trim();
      if (!emoji) return;
      await message.react(emoji).catch(() => {});
      break;
    }
  }
}

function replacePlaceholders(text, message) {
  return text
    .replace(/\{user\}/gi, message.author.toString())
    .replace(/\{username\}/gi, message.author.username)
    .replace(/\{server\}/gi, message.guild.name)
    .replace(/\{channel\}/gi, message.channel.toString())
    .replace(/\{membercount\}/gi, String(message.guild.memberCount))
    .replace(/\{userid\}/gi, message.author.id);
}

module.exports = { handleCustomCommands, invalidateCommandCache };

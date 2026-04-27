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

    // Build response
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

    // Only process first matching command
    return;
  }
}

function matchesTrigger(content, cmd) {
  const text = cmd.caseSensitive ? content : content.toLowerCase();
  const trigger = cmd.caseSensitive ? cmd.trigger : cmd.trigger.toLowerCase();

  switch (cmd.triggerType) {
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

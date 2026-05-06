const { MessageFlags } = require('discord.js');
const { GuildConfig } = require('../models/GuildConfig');
const { handleStickyForChannel, handleCommandTrigger } = require('../lib/scheduler');
const { maybeAwardXpForMessage } = require('../lib/leveling');
const { handleAIMessage } = require('../lib/ai');
const { handleCustomCommands } = require('../lib/customCommands');
const COMMAND_META = require('../commands/meta');

// Maps discord.js option type numbers to their names
const OPTION_TYPES = { 3: 'STRING', 4: 'INTEGER', 5: 'BOOLEAN', 6: 'USER', 7: 'CHANNEL', 8: 'ROLE', 10: 'NUMBER' };
const COMMAND_ALIAS_MAP = buildCommandAliasMap(COMMAND_META);

function buildCommandAliasMap(meta) {
  const aliasMap = new Map();
  for (const [name, cfg] of Object.entries(meta || {})) {
    aliasMap.set(name.toLowerCase(), name.toLowerCase());
    for (const alias of cfg?.aliases || []) {
      aliasMap.set(String(alias).toLowerCase(), name.toLowerCase());
    }
  }
  return aliasMap;
}

function resolveCommandName(input) {
  if (!input) return null;
  return COMMAND_ALIAS_MAP.get(String(input).toLowerCase()) || null;
}

/**
 * Parse positional text args into a named options map based on the command's
 * declared slash command options.
 *
 * @param {string[]} args  - Raw text tokens from the message
 * @param {object[]} opts  - command.data.options array (from SlashCommandBuilder)
 * @param {Guild}    guild - Discord.js Guild object for resolving mentions
 */
async function parseArgs(args, opts, guild) {
  const parsed = {};
  if (!opts?.length) return parsed;

  for (let i = 0; i < opts.length; i++) {
    const opt = opts[i];
    const raw = args[i];
    if (raw === undefined) break;

    const type = OPTION_TYPES[opt.type] ?? 'STRING';

    if (type === 'USER') {
      const mentionId = raw.replace(/[<@!>]/g, '');
      try {
        const member = await guild.members.fetch(mentionId);
        parsed[opt.name] = member?.user ?? null;
      } catch {
        parsed[opt.name] = null;
      }
    } else if (type === 'CHANNEL') {
      const chanId = raw.replace(/[<#>]/g, '');
      parsed[opt.name] = guild.channels.cache.get(chanId) ?? null;
    } else if (type === 'ROLE') {
      const roleId = raw.replace(/[<@&>]/g, '');
      parsed[opt.name] = guild.roles.cache.get(roleId) ?? null;
    } else if (type === 'INTEGER' || type === 'NUMBER') {
      const n = Number(raw);
      parsed[opt.name] = isNaN(n) ? null : n;
    } else if (type === 'BOOLEAN') {
      parsed[opt.name] = raw.toLowerCase() === 'true' || raw === '1';
    } else {
      // STRING — join remaining tokens for the last string option
      if (i === opts.length - 1) {
        parsed[opt.name] = args.slice(i).join(' ');
      } else {
        parsed[opt.name] = raw;
      }
    }
  }

  return parsed;
}

/**
 * Lightweight proxy that makes a Message look enough like a ChatInputCommandInteraction
 * for our bot's commands to work with prefix input.
 */
function buildPrefixInteraction(message, parsedArgs, opts, guildConfig) {
  let replied = false;
  let deferred = false;

  // Normalise payload — strip flags (ephemeral not possible for prefix) and build a clean object
  const normalise = (payload) => {
    if (typeof payload === 'string') return { content: payload };
    const { content, embeds, components, files, attachments } = payload;
    const out = {};
    if (content      !== undefined) out.content     = content;
    if (embeds       !== undefined) out.embeds       = embeds;
    if (components   !== undefined) out.components   = components;
    if (files        !== undefined) out.files        = files;
    if (attachments  !== undefined) out.attachments  = attachments;
    return out;
  };

  return {
    // Identity
    isChatInputCommand: () => true,
    isButton: () => false,
    commandName: 'prefix',
    customId: null,
    guildId: message.guildId,
    channelId: message.channelId,
    guild: message.guild,
    channel: message.channel,
    user: message.author,
    member: message.member,
    client: message.client,
    // memberPermissions mirrors what ChatInputCommandInteraction exposes
    memberPermissions: message.member.permissions,

    // State
    get replied() { return replied; },
    get deferred() { return deferred; },

    // Responders
    deferReply: async () => {
      deferred = true;
      await message.channel.sendTyping().catch(() => {});
    },
    reply: async (payload) => {
      const out = normalise(payload);
      if (!Object.keys(out).length) return;
      if (replied || deferred) return message.channel.send(out);
      replied = true;
      // Use message.reply() so Discord shows the "replying to" indicator
      return message.reply(out);
    },
    editReply: async (payload) => {
      const out = normalise(payload);
      if (!Object.keys(out).length) return;
      return message.channel.send(out);
    },
    followUp: async (payload) => {
      const out = normalise(payload);
      if (!Object.keys(out).length) return;
      return message.channel.send(out);
    },
    // button response stub — never called for prefix but prevents crashes if shared code checks
    update: async () => {},

    // Options accessor
    options: {
      getString(name) { return parsedArgs[name] ?? null; },
      getInteger(name) { return parsedArgs[name] ?? null; },
      getNumber(name) { return parsedArgs[name] ?? null; },
      getBoolean(name) { return parsedArgs[name] ?? null; },
      getUser(name) { return parsedArgs[name] ?? null; },
      getMember(name) { return parsedArgs[name] ? message.guild.members.cache.get(parsedArgs[name]?.id) ?? null : null; },
      getChannel(name) { return parsedArgs[name] ?? null; },
      getRole(name) { return parsedArgs[name] ?? null; },
    },
  };
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    // ── Leveling XP gain ───────────────────────────────────────
    maybeAwardXpForMessage(message).catch(() => {});

    // ── Message Builder: sticky + command triggers ──────────────
    handleStickyForChannel(message.client, message).catch(() => {});
    handleCommandTrigger(message.client, message).catch(() => {});

    // ── AI Message Handler ─────────────────────────────────────
    handleAIMessage(message).catch((err) => {
      console.error(`[AI] unhandled messageCreate error guild=${message.guild?.id || 'n/a'} channel=${message.channelId || 'n/a'}`, err?.message || err);
    });

    // ── Custom Commands ────────────────────────────────────────
    handleCustomCommands(message).catch(() => {});

    // Load guild config
    const guildConfig = await GuildConfig.findOne({ guildId: message.guild.id });
    if (!guildConfig?.prefixEnabled || !guildConfig.prefixes?.length) return;

    // Find which prefix was used
    const content = message.content;
    const usedPrefix = guildConfig.prefixes.find((p) => content.startsWith(p));
    if (!usedPrefix) return;

    const args = content.slice(usedPrefix.length).trim().split(/\s+/);
    const requestedName = args.shift()?.toLowerCase();
    const commandName = resolveCommandName(requestedName);
    if (!commandName) return;

    const command = message.client.commands.get(commandName);
    if (!command) return;

    // Check per-command prefix toggle
    const cmdSettings = guildConfig.commandSettings?.get(commandName);
    if (!cmdSettings?.enabled) return;
    if (cmdSettings.prefixEnabled === false) return;

    // Role restriction check
    if (cmdSettings.allowedRoles?.length > 0) {
      const memberRoleIds = message.member.roles.cache.map((r) => r.id);
      const allowed = cmdSettings.allowedRoles.some((id) => memberRoleIds.includes(id));
      if (!allowed) {
        await message.reply({ content: "You don't have the required role to use this command." });
        return;
      }
    }

    // Channel restriction check
    if (cmdSettings.allowedChannels?.length > 0) {
      if (!cmdSettings.allowedChannels.includes(message.channelId)) {
        await message.reply({ content: 'This command cannot be used in this channel.' });
        return;
      }
    }

    // Build parsed options from text args
    const opts = command.data?.options ?? [];
    const parsedArgs = await parseArgs(args, opts, message.guild);
    const fakeInteraction = buildPrefixInteraction(message, parsedArgs, opts, guildConfig);

    try {
      await command.execute(fakeInteraction, { guildConfig });
    } catch (err) {
      console.error(`Prefix command failed (${commandName}):`, err);
      message.reply({ content: 'There was an error running that command.' }).catch(() => {});
    }
  },
};

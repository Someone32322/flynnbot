/**
 * customCommands.js — Custom Commands adapter v3
 *
 * Thin adapter layer that routes all CC execution through WorkflowEngine / blocks/index.js.
 * All trigger matching, cooldowns, and restriction checks live here.
 * Block execution is fully delegated to the WorkflowEngine (no inline block switch).
 *
 * Fixes: BUG-001 (ephemeral flags), BUG-002 (deferReply), BUG-004 (cooldown eviction)
 * Security: SEC-001 resolved — math uses safe evalMath() in blocks/index.js, not new Function()
 */
'use strict';

const { MessageFlags, EmbedBuilder } = require('discord.js');
const CustomCommand    = require('../models/CustomCommand');
const WorkflowEngine   = require('./workflow/WorkflowEngine');
const ExecutionContext = require('./workflow/ExecutionContext');
const VariableManager  = require('./workflow/VariableManager');

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

// ── Per-command cooldown tracking ─────────────────────────────
// FIX BUG-004: evict expired entries every 60s + cap at 5000 entries
const cooldownMap     = new Map();
const COOLDOWN_MAX    = 5000;
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cooldownMap) {
    if (now > v) cooldownMap.delete(k);
  }
}, 60_000).unref();

// ── Engine singleton ───────────────────────────────────────────
let _engine = null;

/**
 * Call once during bot startup to register the Discord.js client.
 * @param {import('discord.js').Client} client
 */
function initCustomCommands(client) {
  _engine = new WorkflowEngine(client);
}

// ── Cooldown helpers ──────────────────────────────────────────

function _cooldownKey(cmd, member, channelId) {
  const scope = cmd.cooldownScope || 'user';
  switch (scope) {
    case 'guild':   return `g:${member.guild.id}:${cmd._id}`;
    case 'channel': return `c:${member.guild.id}:${cmd._id}:${channelId || 'unk'}`;
    default:        return `u:${member.guild.id}:${cmd._id}:${member.id}`;
  }
}

/**
 * @returns {number} remaining ms, or 0 if not on cooldown
 */
function checkCooldown(cmd, member, channelId) {
  if (!cmd.cooldownSeconds) return 0;
  const expiry    = cooldownMap.get(_cooldownKey(cmd, member, channelId)) || 0;
  const remaining = expiry - Date.now();
  return remaining > 0 ? remaining : 0;
}

function setCooldown(cmd, member, channelId) {
  if (!cmd.cooldownSeconds) return;
  if (cooldownMap.size >= COOLDOWN_MAX) {
    cooldownMap.delete(cooldownMap.keys().next().value);
  }
  cooldownMap.set(_cooldownKey(cmd, member, channelId), Date.now() + cmd.cooldownSeconds * 1000);
}

// ── Restriction check ─────────────────────────────────────────

/**
 * @returns {{ ok: boolean, reason?: string }}
 */
function checkRestrictions(cmd, channelId, memberRoleIds) {
  if (cmd.allowedChannels?.length && !cmd.allowedChannels.includes(channelId)) {
    return { ok: false, reason: 'This command cannot be used in this channel.' };
  }
  if (cmd.allowedRoles?.length) {
    const hasRole = cmd.allowedRoles.some((rid) => memberRoleIds.includes(rid));
    if (!hasRole) return { ok: false, reason: "You don't have the required role to use this command." };
  }
  return { ok: true };
}

// ── Trigger matching ──────────────────────────────────────────

function normalizeTriggerType(type) {
  const raw = String(type || '').toLowerCase();
  if (raw === 'slash_command')  return 'slash';
  if (raw === 'prefix_command') return 'prefix';
  if (raw === 'exact_match')    return 'exact';
  if (raw === 'startswith')     return 'startsWith';
  return raw || 'exact';
}

function matchesTrigger(content, cmd) {
  const type    = normalizeTriggerType(cmd.triggerType);
  const text    = cmd.caseSensitive ? content : content.toLowerCase();
  const trigger = cmd.caseSensitive ? (cmd.trigger || '') : (cmd.trigger || '').toLowerCase();
  switch (type) {
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

// ── Context builder ───────────────────────────────────────────

/**
 * Build an ExecutionContext + VariableManager for a custom command.
 * Returns null if the engine has not been initialized.
 * @param {{ guild, member, channel, message?, interaction?, triggerMeta? }} opts
 * @returns {ExecutionContext|null}
 */
function buildContext({ guild, member, channel, message = null, interaction = null, triggerMeta = {} }) {
  if (!_engine) return null;
  const ctx  = new ExecutionContext({
    client: _engine.client, guild, member, channel,
    message, interaction, triggerMeta, engine: _engine,
  });
  ctx.vars = new VariableManager(ctx);
  return ctx;
}

// ── Legacy command executor ───────────────────────────────────

/**
 * Fallback for commands that have no blocks (legacy text/embed response field).
 */
async function _executeLegacyCommand(cmd, { member, channel, interaction }) {
  const _ph = (t) => String(t || '')
    .replace(/\{user\}/gi,        member.toString())
    .replace(/\{username\}/gi,    member.user.username)
    .replace(/\{server\}/gi,      member.guild.name)
    .replace(/\{channel\}/gi,     channel.toString())
    .replace(/\{membercount\}/gi, String(member.guild.memberCount))
    .replace(/\{userid\}/gi,      member.user.id)
    .replace(/\{tag\}/gi,         member.user.tag || member.user.username);

  const sendOrEdit = async (payload) => {
    if (interaction) {
      if (interaction.deferred || interaction.replied) return interaction.editReply(payload).catch(() => {});
      return interaction.reply(payload).catch(() => {});
    }
    return channel.send(payload).catch(() => {});
  };

  if (cmd.type === 'embed') {
    const embed = new EmbedBuilder().setColor(cmd.embedColor || '#0f52ba').setTimestamp();
    if (cmd.embedTitle)       embed.setTitle(_ph(cmd.embedTitle).slice(0, 256));
    if (cmd.embedDescription) embed.setDescription(_ph(cmd.embedDescription).slice(0, 4096));
    await sendOrEdit({ embeds: [embed] });
  } else {
    await sendOrEdit({ content: _ph(cmd.response) || '\u200b', allowedMentions: { parse: [] } });
  }
}

// ── Main command executor ─────────────────────────────────────

/**
 * Execute a custom command. Routes through WorkflowEngine._executeBlocks().
 * @param {object} cmd            — lean CustomCommand doc
 * @param {ExecutionContext} ctx
 */
async function executeCommand(cmd, ctx) {
  const startMs = Date.now();
  let success = false;
  try {
    if (Array.isArray(cmd.blocks) && cmd.blocks.length > 0) {
      await _engine._executeBlocks(cmd.blocks, ctx);
      success = !ctx.errored;
    } else {
      await _executeLegacyCommand(cmd, {
        member:      ctx.member,
        channel:     ctx.channel,
        interaction: ctx.interaction,
      });
      success = true;
    }
  } catch (err) {
    console.error(`[CustomCommands] Error executing "${cmd.name}":`, err);
  }
  const durationMs = Date.now() - startMs;
  // Fire-and-forget metrics
  CustomCommand.recordExecution(cmd._id, { success, durationMs }).catch(() => {});
  return { success, durationMs };
}

// ── Safe reply helper ─────────────────────────────────────────

/**
 * FIX BUG-001: use MessageFlags.Ephemeral instead of deprecated { ephemeral: true }
 */
async function _safeReply(interaction, content, ephemeral = true) {
  const flags = ephemeral ? MessageFlags.Ephemeral : undefined;
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content, flags });
    } else {
      await interaction.followUp({ content, flags });
    }
  } catch { /* best effort */ }
}

// ── Event-type trigger list ───────────────────────────────────
const EVENT_TRIGGER_TYPES = new Set([
  'button', 'select_menu',
  'member_join', 'member_leave',
  'reaction_add', 'reaction_remove',
  'voice_join', 'voice_leave',
  'message_delete', 'scheduled',
]);

// ── Message handler ───────────────────────────────────────────

/**
 * @param {import('discord.js').Message} message
 */
async function handleCustomCommands(message) {
  if (message.author.bot || !message.guild) return;

  const cmds = await getGuildCommands(message.guild.id);
  if (!cmds.length) return;

  const { content, channelId } = message;

  for (const cmd of cmds) {
    // Skip event-type triggers — they aren't fired by messages
    if (EVENT_TRIGGER_TYPES.has(normalizeTriggerType(cmd.triggerType))) continue;
    if (!matchesTrigger(content, cmd)) continue;

    const memberRoleIds = message.member?.roles.cache.map((r) => r.id) || [];
    const restriction   = checkRestrictions(cmd, channelId, memberRoleIds);
    if (!restriction.ok) continue;

    if (checkCooldown(cmd, message.member, channelId)) continue;
    setCooldown(cmd, message.member, channelId);

    if (cmd.deleteUserMessage) message.delete().catch(() => {});

    const ctx = buildContext({
      guild:   message.guild,
      member:  message.member,
      channel: message.channel,
      message,
    });

    if (ctx) await executeCommand(cmd, ctx).catch(() => {});
    return; // first match only
  }
}

// ── Slash command handler ─────────────────────────────────────

/**
 * FIX BUG-002: deferReply() before any async work to beat 3s Discord deadline.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<boolean>} true when a custom slash command was handled
 */
async function handleCustomSlashInteraction(interaction) {
  if (!interaction?.isChatInputCommand?.() || !interaction.guildId) return false;

  const cmds = await getGuildCommands(interaction.guildId);
  if (!cmds.length) return false;

  const cmd = cmds.find((c) =>
    normalizeTriggerType(c.triggerType) === 'slash'
    && String(c.trigger || '').toLowerCase() === String(interaction.commandName || '').toLowerCase()
  );
  if (!cmd) return false;

  // Must defer BEFORE any DB/API work to avoid Unknown Interaction (10062) after 3s
  const ephemeral = cmd.ephemeralErrors ?? false;
  try {
    await interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined });
  } catch {
    return true; // already expired or acknowledged elsewhere
  }

  const memberRoleIds = interaction.member?.roles?.cache?.map((r) => r.id) || [];
  const restriction   = checkRestrictions(cmd, interaction.channelId, memberRoleIds);
  if (!restriction.ok) {
    await _safeReply(interaction, restriction.reason ?? 'You cannot use this command here.');
    return true;
  }

  const remaining = checkCooldown(cmd, interaction.member, interaction.channelId);
  if (remaining > 0) {
    await _safeReply(interaction, `Please wait ${Math.ceil(remaining / 1000)}s before using this command again.`);
    return true;
  }
  setCooldown(cmd, interaction.member, interaction.channelId);

  const ctx = buildContext({
    guild:       interaction.guild,
    member:      interaction.member,
    channel:     interaction.channel,
    interaction,
    triggerMeta: { options: interaction.options?.data || [] },
  });

  if (ctx) await executeCommand(cmd, ctx).catch(() => {});
  return true;
}

// ── Component interaction handler ─────────────────────────────

/**
 * Handle button/select_menu CC triggers.
 * @param {import('discord.js').MessageComponentInteraction} interaction
 * @returns {Promise<boolean>}
 */
async function handleCustomComponentInteraction(interaction) {
  if (!interaction.guild || !interaction.guildId) return false;
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return false;

  const triggerType = interaction.isButton() ? 'button' : 'select_menu';
  const cmds        = await getGuildCommands(interaction.guildId);
  const cmd         = cmds.find(
    (c) => normalizeTriggerType(c.triggerType) === triggerType
        && c.trigger === interaction.customId
  );
  if (!cmd) return false;

  try {
    await interaction.deferReply({ flags: (cmd.ephemeralErrors ?? false) ? MessageFlags.Ephemeral : undefined });
  } catch { return true; }

  const memberRoleIds = interaction.member?.roles?.cache?.map((r) => r.id) || [];
  const restriction   = checkRestrictions(cmd, interaction.channelId, memberRoleIds);
  if (!restriction.ok) { await _safeReply(interaction, restriction.reason); return true; }

  const remaining = checkCooldown(cmd, interaction.member, interaction.channelId);
  if (remaining > 0) {
    await _safeReply(interaction, `Please wait ${Math.ceil(remaining / 1000)}s before using this command again.`);
    return true;
  }
  setCooldown(cmd, interaction.member, interaction.channelId);

  const ctx = buildContext({
    guild:       interaction.guild,
    member:      interaction.member,
    channel:     interaction.channel,
    interaction,
    triggerMeta: { componentType: triggerType, customId: interaction.customId, values: interaction.values || [] },
  });

  if (ctx) await executeCommand(cmd, ctx).catch(() => {});
  return true;
}

// ── Event-triggered CC handler ────────────────────────────────

/**
 * Fire event-triggered custom commands (member_join, reaction_add, etc.)
 * @param {string} guildId
 * @param {string} eventType — e.g. 'member_join'
 * @param {{ guild, member, channel?, message?, emoji? }} eventData
 */
async function handleCustomCommandEvent(guildId, eventType, eventData) {
  const cmds = await getGuildCommands(guildId);
  if (!cmds.length) return;

  const eventCmds = cmds.filter((c) => normalizeTriggerType(c.triggerType) === eventType);
  if (!eventCmds.length) return;

  const { guild, member, channel } = eventData;
  if (!guild || !member) return;

  for (const cmd of eventCmds) {
    // Optional event-filter from eventTrigger sub-doc
    if (cmd.eventTrigger) {
      const et = cmd.eventTrigger;
      if (et.emoji && eventData.emoji) {
        const emojiStr = typeof eventData.emoji === 'string' ? eventData.emoji : (eventData.emoji?.name || '');
        if (emojiStr && emojiStr !== et.emoji) continue;
      }
      if (et.channelId && channel?.id && channel.id !== et.channelId) continue;
      if (et.messageId && eventData.message?.id && eventData.message.id !== et.messageId) continue;
    }

    const remaining = checkCooldown(cmd, member, channel?.id);
    if (remaining > 0) continue;
    setCooldown(cmd, member, channel?.id);

    const ctx = buildContext({
      guild,
      member,
      channel:     channel || guild.systemChannel,
      message:     eventData.message || null,
      triggerMeta: { event: eventType, ...eventData },
    });

    if (ctx) await executeCommand(cmd, ctx).catch(() => {});
  }
}

// ── Exports ───────────────────────────────────────────────────

module.exports = {
  initCustomCommands,
  handleCustomCommands,
  handleCustomSlashInteraction,
  handleCustomComponentInteraction,
  handleCustomCommandEvent,
  invalidateCommandCache,
  // Exposed for testing
  matchesTrigger,
  checkCooldown,
  setCooldown,
  checkRestrictions,
  buildContext,
  normalizeTriggerType,
};


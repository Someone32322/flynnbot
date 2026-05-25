'use strict';

/**
 * commandEngine/hooks.js
 *
 * Thin adapter between Discord event handlers and the ExecutionEngine.
 * Mirrors the interface of the old workflow/hooks.js for easy drop-in replacement.
 *
 * Phase 1: Stubs — engine is initialized but all handlers return immediately.
 * Phase 2: Full implementation wired into ExecutionEngine.
 */

const { ExecutionEngine } = require('./ExecutionEngine');
const { loadBlocks }      = require('./blocks/index');

/** @type {ExecutionEngine|null} */
let _engine = null;

/**
 * Initialize the command engine. Called once at bot startup (ready event).
 * @param {import('discord.js').Client} client
 */
function init(client) {
  if (_engine) return _engine;
  try {
    _engine = new ExecutionEngine(client);
    _engine.loadBlocks(loadBlocks);
    console.log('[CommandEngine] Initialized successfully');
    return _engine;
  } catch (err) {
    console.error('[CommandEngine] Failed to initialize:', err);
    return null;
  }
}

/**
 * Get the engine instance (for cache invalidation from API routes).
 * @returns {ExecutionEngine|null}
 */
function getEngine() {
  return _engine;
}

/**
 * Invalidate the command cache for a guild.
 * Call this after a GuildCommand is saved via the dashboard API.
 * @param {string} guildId
 */
function invalidateCache(guildId) {
  _engine?.invalidateCache(guildId);
}

// ─────────────────────────────────────────────
// Event hook stubs — called from bot event files
// ─────────────────────────────────────────────

/**
 * Called from events/interactionCreate.js
 * Routes the interaction to slash / component / modal handlers.
 * @param {import('discord.js').Interaction} interaction
 * @returns {Promise<boolean>} true if handled by a guild command
 */
async function onInteraction(interaction) {
  if (!_engine) return false;
  try {
    if (interaction.isChatInputCommand()) {
      return await _engine.handleSlash(interaction);
    }
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      return await _engine.handleComponent(interaction);
    }
    if (interaction.isModalSubmit()) {
      return await _engine.handleModal(interaction);
    }
  } catch (err) {
    console.error('[CommandEngine] onInteraction error:', err);
  }
  return false;
}

/**
 * Called from events/messageCreate.js
 * @param {import('discord.js').Message} message
 * @returns {Promise<boolean>} true if handled
 */
async function onMessage(message) {
  if (!_engine) return false;
  try {
    return await _engine.handleMessage(message);
  } catch (err) {
    console.error('[CommandEngine] onMessage error:', err);
    return false;
  }
}

/**
 * Called from events/guildMemberAdd.js
 * @param {import('discord.js').GuildMember} member
 */
async function onMemberJoin(member) {
  if (!_engine) return;
  try {
    await _engine.handleMemberJoin(member);
  } catch (err) {
    console.error('[CommandEngine] onMemberJoin error:', err);
  }
}

/**
 * Called from events/guildMemberRemove.js
 * @param {import('discord.js').GuildMember} member
 */
async function onMemberLeave(member) {
  if (!_engine) return;
  try {
    await _engine.handleMemberLeave(member);
  } catch (err) {
    console.error('[CommandEngine] onMemberLeave error:', err);
  }
}

/**
 * Called from events/messageReactionAdd.js
 * @param {import('discord.js').MessageReaction} reaction
 * @param {import('discord.js').User} user
 */
async function onReactionAdd(reaction, user) {
  if (!_engine) return;
  try {
    await _engine.handleReactionAdd(reaction, user);
  } catch (err) {
    console.error('[CommandEngine] onReactionAdd error:', err);
  }
}

/**
 * Called from events/messageReactionRemove.js
 * @param {import('discord.js').MessageReaction} reaction
 * @param {import('discord.js').User} user
 */
async function onReactionRemove(reaction, user) {
  if (!_engine) return;
  try {
    await _engine.handleReactionRemove(reaction, user);
  } catch (err) {
    console.error('[CommandEngine] onReactionRemove error:', err);
  }
}

/**
 * Called from events/voiceStateUpdate.js
 * @param {import('discord.js').VoiceState} oldState
 * @param {import('discord.js').VoiceState} newState
 */
async function onVoiceUpdate(oldState, newState) {
  if (!_engine) return;
  try {
    await _engine.handleVoiceUpdate(oldState, newState);
  } catch (err) {
    console.error('[CommandEngine] onVoiceUpdate error:', err);
  }
}

/**
 * Called from the scheduler on every tick.
 */
async function onScheduledTick() {
  if (!_engine) return;
  try {
    await _engine.handleScheduledTick();
  } catch (err) {
    console.error('[CommandEngine] onScheduledTick error:', err);
  }
}

module.exports = {
  init,
  getEngine,
  invalidateCache,
  onInteraction,
  onMessage,
  onMemberJoin,
  onMemberLeave,
  onReactionAdd,
  onReactionRemove,
  onVoiceUpdate,
  onScheduledTick,
};

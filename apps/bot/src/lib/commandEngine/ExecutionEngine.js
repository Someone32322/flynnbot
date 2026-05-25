'use strict';

const { BlockRegistry }    = require('./BlockRegistry');
const { ExecutionContext }  = require('./ExecutionContext');
const { GuildCommand }      = require('../../models/GuildCommand');
const StoredVariable        = require('../../models/StoredVariable');
const StoredVariableValue   = require('../../models/StoredVariableValue');
const { MessageFlags }      = require('discord.js');

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const MAX_BLOCKS_PER_CMD       = 100;
const MAX_EXECUTION_DEPTH      = 5;
const MAX_EXECUTION_TIMEOUT_MS = 30_000;
const MAX_LOOP_ITERATIONS      = 100;

// ─────────────────────────────────────────────
// Cooldown store (in-memory; resets on restart)
// ─────────────────────────────────────────────

/** @type {Map<string, number>} key → expiresAt (ms) */
const _cooldowns = new Map();

function _cooldownKey(cmdId, scope, userId, channelId, guildId) {
  switch (scope) {
    case 'user':    return `cd:${cmdId}:u:${userId}`;
    case 'channel': return `cd:${cmdId}:c:${channelId}`;
    case 'guild':   return `cd:${cmdId}:g:${guildId}`;
    default:        return `cd:${cmdId}:u:${userId}`;
  }
}

function _checkCooldown(cmdId, conditions, userId, channelId, guildId) {
  const cd = conditions?.cooldown;
  if (!cd || !cd.seconds || cd.seconds <= 0) return null;
  const key       = _cooldownKey(cmdId, cd.scope || 'user', userId, channelId, guildId);
  const expiresAt = _cooldowns.get(key);
  if (expiresAt && expiresAt > Date.now()) {
    const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
    return remaining;
  }
  return null;
}

function _setCooldown(cmdId, conditions, userId, channelId, guildId) {
  const cd = conditions?.cooldown;
  if (!cd || !cd.seconds || cd.seconds <= 0) return;
  const key = _cooldownKey(cmdId, cd.scope || 'user', userId, channelId, guildId);
  _cooldowns.set(key, Date.now() + cd.seconds * 1000);
  // Cleanup old entries periodically
  if (_cooldowns.size > 10000) {
    const now = Date.now();
    for (const [k, v] of _cooldowns) {
      if (v < now) _cooldowns.delete(k);
    }
  }
}

// ─────────────────────────────────────────────
// Scheduled commands tracker
// ─────────────────────────────────────────────

/** @type {Map<string, number>} cmdId → lastRunAt (ms) */
const _lastScheduledRun = new Map();

/**
 * ExecutionEngine
 */
class ExecutionEngine {
  /** @param {import('discord.js').Client} client */
  constructor(client) {
    this.client   = client;
    this.registry = new BlockRegistry();

    /** @type {Map<string, { commands: GuildCommand[], fetchedAt: number }>} */
    this._cache = new Map();
    this._cacheTTL = 5_000;
  }

  // ── Block Registry ────────────────────────────────────────────

  loadBlocks(loader) {
    loader(this.registry);
  }

  // ── Cache ─────────────────────────────────────────────────────

  invalidateCache(guildId) {
    this._cache.delete(guildId);
  }

  async _fetchCommands(guildId) {
    const cached = this._cache.get(guildId);
    if (cached && (Date.now() - cached.fetchedAt) < this._cacheTTL) {
      return cached.commands;
    }
    const commands = await GuildCommand.find({ guildId, enabled: true }).lean();
    this._cache.set(guildId, { commands, fetchedAt: Date.now() });
    return commands;
  }

  // ── Stored variable helpers ───────────────────────────────────

  async _loadStoredVars(guildId, userId, commandId) {
    const [storedDefs, storedValues] = await Promise.all([
      StoredVariable.find({ guildId }).lean().catch(() => []),
      StoredVariableValue.find({
        guildId,
        $or: [
          { scope: 'guild' },
          { scope: 'user',    userId },
          { scope: 'command', commandId },
        ],
      }).lean().catch(() => []),
    ]);
    return { storedDefs, storedValues };
  }

  async _flushStoredVars(dirtyVars) {
    if (!dirtyVars || !dirtyVars.length) return;
    await Promise.all(dirtyVars.map(d => {
      if (d.deleted) {
        return StoredVariableValue.deleteOne({
          definitionId: d.definitionId,
          scope:        d.scope,
          userId:       d.userId,
          commandId:    d.commandId,
        }).catch(() => null);
      }
      return StoredVariableValue.findOneAndUpdate(
        { definitionId: d.definitionId, scope: d.scope, userId: d.userId, commandId: d.commandId },
        { $set: { guildId: d.guildId, value: d.value, updatedAt: new Date() } },
        { upsert: true },
      ).catch(() => null);
    }));
  }

  // ── Conditions ────────────────────────────────────────────────

  _checkConditions(cmd, member, channel, userId) {
    const c = cmd.conditions;
    if (!c) return true;

    // Allowed roles — must have at least one
    if (c.allowedRoles?.length) {
      const has = c.allowedRoles.some(roleId => member?.roles?.cache?.has(roleId));
      if (!has) return false;
    }
    // Ignored roles — must not have any
    if (c.ignoredRoles?.length) {
      const blocked = c.ignoredRoles.some(roleId => member?.roles?.cache?.has(roleId));
      if (blocked) return false;
    }
    // Allowed channels
    if (c.allowedChannels?.length) {
      if (!c.allowedChannels.includes(channel?.id)) return false;
    }
    // Ignored channels
    if (c.ignoredChannels?.length) {
      if (c.ignoredChannels.includes(channel?.id)) return false;
    }
    // Required permissions
    if (c.requiredPermissions?.length) {
      for (const perm of c.requiredPermissions) {
        if (!member?.permissions?.has(perm)) return false;
      }
    }
    return true;
  }

  // ── Block execution ───────────────────────────────────────────

  /**
   * Execute a list of blocks sequentially.
   * Returns 'stop' sentinel if a stop block fires.
   * @param {object[]} blocks
   * @param {ExecutionContext} ctx
   * @param {number} [nestLevel=0]
   */
  async _executeBlocks(blocks, ctx, nestLevel = 0) {
    if (!Array.isArray(blocks) || blocks.length === 0) return;
    if (nestLevel > MAX_EXECUTION_DEPTH) {
      console.warn('[CommandEngine] Max nesting depth exceeded in _executeBlocks');
      return;
    }
    const limited = blocks.slice(0, MAX_BLOCKS_PER_CMD);
    for (const block of limited) {
      if (ctx.isAborted()) break;
      const def = this.registry.get(block.type);
      if (!def) {
        console.warn(`[CommandEngine] Unknown block type: ${block.type}`);
        continue;
      }
      try {
        const result = await def.execute(block.data || {}, ctx);
        if (result === 'stop') return 'stop';
      } catch (err) {
        console.error(`[CommandEngine] Block ${block.type} error:`, err.message);
        // Non-fatal — continue to next block unless it's a truly unexpected error
      }
    }
  }

  // ── Main entry points ─────────────────────────────────────────

  async handleSlash(interaction) {
    if (!interaction.guildId) return false;
    const commands = await this._fetchCommands(interaction.guildId).catch(() => []);
    const cmd = commands.find(c =>
      c.trigger?.type === 'slash' &&
      c.trigger?.value?.toLowerCase() === interaction.commandName?.toLowerCase()
    );
    if (!cmd) return false;

    const userId    = interaction.user.id;
    const channelId = interaction.channelId;
    const guildId   = interaction.guildId;

    // Defer BEFORE any async work (critical to avoid Unknown interaction timeout)
    const ephemeral = Boolean(cmd.conditions?.ephemeralReply);
    await interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined }).catch(() => null);

    // Cooldown check
    const remaining = _checkCooldown(String(cmd._id), cmd.conditions, userId, channelId, guildId);
    if (remaining !== null) {
      await interaction.editReply({ content: `⏱️ Command is on cooldown. Try again in **${remaining}s**.` }).catch(() => null);
      return true;
    }

    const guild   = this.client.guilds.cache.get(guildId);
    const member  = interaction.member || await guild?.members.fetch(userId).catch(() => null);
    const channel = interaction.channel || guild?.channels.cache.get(channelId);

    if (!this._checkConditions(cmd, member, channel, userId)) {
      await interaction.editReply({ content: '❌ You do not have permission to use this command.' }).catch(() => null);
      return true;
    }

    _setCooldown(String(cmd._id), cmd.conditions, userId, channelId, guildId);

    const { storedDefs, storedValues } = await this._loadStoredVars(guildId, userId, String(cmd._id));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MAX_EXECUTION_TIMEOUT_MS);

    const trigger = {
      type:  'slash',
      value: interaction.commandName,
      raw:   interaction,
    };

    const ctx = new ExecutionContext({
      client:         this.client,
      guild,
      member,
      channel,
      interaction,
      message:        null,
      trigger,
      storedDefs,
      storedValues,
      userId,
      commandId:      String(cmd._id),
      executionCount: (cmd.metadata?.executionCount || 0) + 1,
      engine:         this,
      depth:          0,
      abortSignal:    controller.signal,
    });

    await this.execute(cmd, ctx);
    clearTimeout(timeout);
    return true;
  }

  async handleComponent(interaction) {
    if (!interaction.guildId) return false;
    const customId = interaction.customId || '';
    // Our components use the gc:{cmdId}:{...} prefix
    if (!customId.startsWith('gc:')) return false;

    const parts = customId.split(':');
    const cmdId = parts[1];
    if (!cmdId) return false;

    const commands = await this._fetchCommands(interaction.guildId).catch(() => []);
    const cmd = commands.find(c => String(c._id) === cmdId);
    if (!cmd) return false;

    const triggerType = interaction.isButton() ? 'button' : 'select_menu';
    const cmd2 = (cmd.trigger?.type === triggerType || cmd.trigger?.type === 'button' || cmd.trigger?.type === 'select_menu') ? cmd : null;
    if (!cmd2) return false;

    const userId    = interaction.user.id;
    const channelId = interaction.channelId;
    const guildId   = interaction.guildId;

    const ephemeral = Boolean(cmd2.conditions?.ephemeralReply);
    await interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined }).catch(() => null);

    const guild   = this.client.guilds.cache.get(guildId);
    const member  = interaction.member || await guild?.members.fetch(userId).catch(() => null);
    const channel = interaction.channel || guild?.channels.cache.get(channelId);

    if (!this._checkConditions(cmd2, member, channel, userId)) {
      await interaction.editReply({ content: '❌ You do not have permission to use this.' }).catch(() => null);
      return true;
    }

    const { storedDefs, storedValues } = await this._loadStoredVars(guildId, userId, cmdId);
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), MAX_EXECUTION_TIMEOUT_MS);

    const trigger = {
      type:  triggerType,
      value: customId,
      raw:   interaction,
    };

    const ctx = new ExecutionContext({
      client:         this.client,
      guild,
      member,
      channel,
      interaction,
      message:        null,
      trigger,
      storedDefs,
      storedValues,
      userId,
      commandId:      cmdId,
      executionCount: (cmd2.metadata?.executionCount || 0) + 1,
      engine:         this,
      depth:          0,
      abortSignal:    controller.signal,
    });

    await this.execute(cmd2, ctx);
    clearTimeout(timeout);
    return true;
  }

  async handleModal(interaction) {
    if (!interaction.guildId) return false;
    const customId = interaction.customId || '';
    if (!customId.startsWith('gc:')) return false;

    const parts = customId.split(':');
    const cmdId = parts[1];
    if (!cmdId) return false;

    const commands = await this._fetchCommands(interaction.guildId).catch(() => []);
    const cmd = commands.find(c => String(c._id) === cmdId && c.trigger?.type === 'modal_submit');
    if (!cmd) return false;

    const userId    = interaction.user.id;
    const channelId = interaction.channelId;
    const guildId   = interaction.guildId;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);

    const guild   = this.client.guilds.cache.get(guildId);
    const member  = interaction.member || await guild?.members.fetch(userId).catch(() => null);
    const channel = interaction.channel || guild?.channels.cache.get(channelId);

    const { storedDefs, storedValues } = await this._loadStoredVars(guildId, userId, cmdId);
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), MAX_EXECUTION_TIMEOUT_MS);

    const trigger = { type: 'modal_submit', value: customId, raw: interaction };

    const ctx = new ExecutionContext({
      client:         this.client,
      guild,
      member,
      channel,
      interaction,
      message:        null,
      trigger,
      storedDefs,
      storedValues,
      userId,
      commandId:      cmdId,
      executionCount: (cmd.metadata?.executionCount || 0) + 1,
      engine:         this,
      depth:          0,
      abortSignal:    controller.signal,
    });

    await this.execute(cmd, ctx);
    clearTimeout(timeout);
    return true;
  }

  async handleMessage(message) {
    if (!message.guildId || message.author?.bot) return false;

    const commands = await this._fetchCommands(message.guildId).catch(() => []);
    const textTypes = ['prefix', 'contains', 'exact', 'startsWith', 'regex'];
    const candidates = commands.filter(c => textTypes.includes(c.trigger?.type));
    if (!candidates.length) return false;

    const content = message.content || '';
    let matched = null;
    let triggerValue = '';
    let triggerType  = '';

    for (const cmd of candidates) {
      const type = cmd.trigger.type;
      const val  = cmd.trigger.value || '';
      let hit = false;

      switch (type) {
        case 'prefix':
          hit = content.startsWith(val);
          break;
        case 'exact':
          hit = content.trim() === val.trim();
          break;
        case 'contains':
          hit = content.toLowerCase().includes(val.toLowerCase());
          break;
        case 'startsWith':
          hit = content.toLowerCase().startsWith(val.toLowerCase());
          break;
        case 'regex':
          try {
            if (val.length <= 200) {
              hit = new RegExp(val, 'i').test(content);
            }
          } catch { /* ignore bad regex */ }
          break;
      }

      if (hit) {
        matched       = cmd;
        triggerType   = type;
        triggerValue  = val;
        break;
      }
    }

    if (!matched) return false;

    const userId    = message.author.id;
    const channelId = message.channelId;
    const guildId   = message.guildId;
    const guild     = message.guild;
    const member    = message.member || await guild?.members.fetch(userId).catch(() => null);
    const channel   = message.channel;

    const remaining = _checkCooldown(String(matched._id), matched.conditions, userId, channelId, guildId);
    if (remaining !== null) {
      await message.reply({ content: `⏱️ Command on cooldown. Try again in **${remaining}s**.` }).catch(() => null);
      return true;
    }

    if (!this._checkConditions(matched, member, channel, userId)) return false;
    _setCooldown(String(matched._id), matched.conditions, userId, channelId, guildId);

    const { storedDefs, storedValues } = await this._loadStoredVars(guildId, userId, String(matched._id));
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), MAX_EXECUTION_TIMEOUT_MS);

    const trigger = { type: triggerType, value: triggerValue, raw: message };

    const ctx = new ExecutionContext({
      client:         this.client,
      guild,
      member,
      channel,
      interaction:    null,
      message,
      trigger,
      storedDefs,
      storedValues,
      userId,
      commandId:      String(matched._id),
      executionCount: (matched.metadata?.executionCount || 0) + 1,
      engine:         this,
      depth:          0,
      abortSignal:    controller.signal,
    });

    await this.execute(matched, ctx);
    clearTimeout(timeout);
    return true;
  }

  async handleMemberJoin(member) {
    if (!member.guild?.id) return;
    const commands = await this._fetchCommands(member.guild.id).catch(() => []);
    const matching = commands.filter(c => c.trigger?.type === 'member_join');
    for (const cmd of matching) {
      await this._runEventCommand(cmd, {
        guild:   member.guild,
        member,
        channel: null,
        trigger: { type: 'member_join', value: '', raw: member },
        userId:  member.id,
      }).catch(err => console.error('[CommandEngine] member_join error:', err));
    }
  }

  async handleMemberLeave(member) {
    if (!member.guild?.id) return;
    const commands = await this._fetchCommands(member.guild.id).catch(() => []);
    const matching = commands.filter(c => c.trigger?.type === 'member_leave');
    for (const cmd of matching) {
      await this._runEventCommand(cmd, {
        guild:   member.guild,
        member,
        channel: null,
        trigger: { type: 'member_leave', value: '', raw: member },
        userId:  member.id,
      }).catch(() => null);
    }
  }

  async handleReactionAdd(reaction, user) {
    if (!reaction.message?.guildId) return;
    const guildId  = reaction.message.guildId;
    const commands = await this._fetchCommands(guildId).catch(() => []);
    const emoji    = reaction.emoji?.name || '';
    const matching = commands.filter(c =>
      c.trigger?.type === 'reaction_add' &&
      (!c.trigger?.value || c.trigger.value === emoji)
    );
    const guild  = reaction.message.guild;
    const member = await guild?.members.fetch(user.id).catch(() => null);
    for (const cmd of matching) {
      await this._runEventCommand(cmd, {
        guild,
        member,
        channel: reaction.message.channel,
        trigger: { type: 'reaction_add', value: emoji, raw: { reaction, user } },
        userId:  user.id,
      }).catch(() => null);
    }
  }

  async handleReactionRemove(reaction, user) {
    if (!reaction.message?.guildId) return;
    const guildId  = reaction.message.guildId;
    const commands = await this._fetchCommands(guildId).catch(() => []);
    const emoji    = reaction.emoji?.name || '';
    const matching = commands.filter(c =>
      c.trigger?.type === 'reaction_remove' &&
      (!c.trigger?.value || c.trigger.value === emoji)
    );
    const guild  = reaction.message.guild;
    const member = await guild?.members.fetch(user.id).catch(() => null);
    for (const cmd of matching) {
      await this._runEventCommand(cmd, {
        guild,
        member,
        channel: reaction.message.channel,
        trigger: { type: 'reaction_remove', value: emoji, raw: { reaction, user } },
        userId:  user.id,
      }).catch(() => null);
    }
  }

  async handleVoiceUpdate(oldState, newState) {
    const guildId = newState.guild?.id || oldState.guild?.id;
    if (!guildId) return;
    const commands = await this._fetchCommands(guildId).catch(() => []);

    const joinCmd  = !oldState.channelId && newState.channelId;
    const leaveCmd = oldState.channelId && !newState.channelId;
    if (!joinCmd && !leaveCmd) return;

    const triggerType = joinCmd ? 'voice_join' : 'voice_leave';
    const matching = commands.filter(c => c.trigger?.type === triggerType);
    if (!matching.length) return;

    const guild  = newState.guild || oldState.guild;
    const member = newState.member || oldState.member;
    const userId = member?.id || newState.id;

    for (const cmd of matching) {
      await this._runEventCommand(cmd, {
        guild,
        member,
        channel: newState.channel || oldState.channel,
        trigger: { type: triggerType, value: '', raw: { oldState, newState } },
        userId,
      }).catch(() => null);
    }
  }

  async handleScheduledTick() {
    // Get all guilds the bot is in
    const guildIds = Array.from(this.client.guilds.cache.keys());
    const now = Date.now();

    for (const guildId of guildIds) {
      const commands = await this._fetchCommands(guildId).catch(() => []);
      const scheduled = commands.filter(c => c.trigger?.type === 'scheduled' && c.trigger?.config?.intervalMinutes > 0);

      for (const cmd of scheduled) {
        const intervalMs = (cmd.trigger.config.intervalMinutes || 60) * 60_000;
        const lastRun    = _lastScheduledRun.get(String(cmd._id)) || 0;
        if (now - lastRun < intervalMs) continue;

        _lastScheduledRun.set(String(cmd._id), now);
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) continue;

        await this._runEventCommand(cmd, {
          guild,
          member:  null,
          channel: guild.systemChannel || null,
          trigger: { type: 'scheduled', value: '', raw: null },
          userId:  null,
        }).catch(err => console.error('[CommandEngine] scheduled error:', err));
      }
    }
  }

  // ── Internal event command runner ─────────────────────────────

  async _runEventCommand(cmd, { guild, member, channel, trigger, userId }) {
    const guildId  = guild?.id;
    const cmdId    = String(cmd._id);
    if (!this._checkConditions(cmd, member, channel, userId)) return;

    const { storedDefs, storedValues } = await this._loadStoredVars(guildId, userId, cmdId);
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), MAX_EXECUTION_TIMEOUT_MS);

    const ctx = new ExecutionContext({
      client:         this.client,
      guild,
      member,
      channel,
      interaction:    null,
      message:        null,
      trigger,
      storedDefs,
      storedValues,
      userId,
      commandId:      cmdId,
      executionCount: (cmd.metadata?.executionCount || 0) + 1,
      engine:         this,
      depth:          0,
      abortSignal:    controller.signal,
    });

    await this.execute(cmd, ctx);
    clearTimeout(timeout);
  }

  // ── Core execution ────────────────────────────────────────────

  async execute(cmd, ctx) {
    const startedAt = Date.now();
    let status = 'success';

    try {
      if (ctx.depth > MAX_EXECUTION_DEPTH) {
        console.warn(`[CommandEngine] Max depth (${MAX_EXECUTION_DEPTH}) reached for cmd=${cmd._id}`);
        return { status: 'error', durationMs: 0 };
      }
      if (ctx.isAborted()) {
        return { status: 'error', durationMs: 0 };
      }

      const blocks = Array.isArray(cmd.blocks) ? cmd.blocks : [];
      await this._executeBlocks(blocks, ctx);

      // Flush dirty stored variables to MongoDB
      const dirty = ctx.vars.getDirtyStored?.() || [];
      if (dirty.length) await this._flushStoredVars(dirty);

    } catch (err) {
      console.error(`[CommandEngine] Execution error cmd=${cmd._id}:`, err);
      status = 'error';
    }

    const durationMs = Date.now() - startedAt;
    GuildCommand.recordExecution(cmd._id, { status, durationMs }).catch(() => null);
    return { status, durationMs };
  }

  // ── Context builder ───────────────────────────────────────────

  async buildContext({ guild, member, channel, interaction, message, trigger, storedDefs = [], storedValues = [], userId = null, commandId = null }) {
    return new ExecutionContext({
      client:      this.client,
      guild,
      member,
      channel,
      interaction:  interaction ?? null,
      message:      message ?? null,
      trigger,
      storedDefs,
      storedValues,
      userId,
      commandId,
      engine:       this,
    });
  }
}

module.exports = { ExecutionEngine, MAX_BLOCKS_PER_CMD, MAX_EXECUTION_DEPTH, MAX_LOOP_ITERATIONS };

'use strict';

const { VariableManager } = require('./VariableManager');

/**
 * ExecutionContext
 *
 * Passed to every block executor during a command run.
 * Provides access to Discord objects, variable resolution,
 * and back-reference to the engine for sub-execution.
 */
class ExecutionContext {
  /**
   * @param {object} opts
   * @param {import('discord.js').Client} opts.client
   * @param {import('discord.js').Guild} opts.guild
   * @param {import('discord.js').GuildMember|null} opts.member
   * @param {import('discord.js').TextChannel|null} opts.channel
   * @param {import('discord.js').Interaction|null} opts.interaction
   * @param {import('discord.js').Message|null} opts.message
   * @param {{ type: string, value: string, raw: any }} opts.trigger
   * @param {object[]} [opts.storedDefs]    StoredVariable definition docs
   * @param {object[]} [opts.storedValues]  StoredVariableValue docs for current user
   * @param {string|null} [opts.userId]     Override user ID (falls back to member.id)
   * @param {string|null} [opts.commandId]  GuildCommand _id string
   * @param {number} [opts.executionCount]  Lifetime execution count for this command
   * @param {import('./ExecutionEngine')} opts.engine
   * @param {number} [opts.depth]
   * @param {AbortSignal} [opts.abortSignal]
   */
  constructor({
    client,
    guild,
    member,
    channel,
    interaction,
    message,
    trigger,
    storedDefs     = [],
    storedValues   = [],
    userId         = null,
    commandId      = null,
    executionCount = 0,
    engine,
    depth = 0,
    abortSignal = null,
  }) {
    this.client      = client;
    this.guild       = guild;
    this.member      = member;
    this.channel     = channel;
    this.interaction = interaction;
    this.message     = message;
    this.trigger     = trigger;
    this.engine      = engine;
    this.depth       = depth;
    this.abortSignal = abortSignal;

    // Shortcuts
    this.guildId = guild?.id ?? null;
    this.userId  = userId ?? member?.id ?? null;

    // Variable manager — Phase 2 interface with storedDefs/storedValues
    this.vars = new VariableManager({
      guild,
      member,
      channel,
      trigger,
      storedDefs,
      storedValues,
      userId:         this.userId,
      commandId,
      executionCount,
    });
  }

  /**
   * Resolve a template string with current variables.
   * Shorthand for ctx.vars.resolve(template).
   * @param {string} template
   * @returns {string}
   */
  resolve(template) {
    return this.vars.resolve(template);
  }

  /**
   * Check if execution has been aborted (timeout).
   * Blocks should call this in long loops.
   * @returns {boolean}
   */
  isAborted() {
    return this.abortSignal?.aborted === true;
  }

  /**
   * Create a child context for sub-execution (e.g. run_command block).
   * Increments depth and shares the same client/guild.
   * @param {object} [overrides]
   * @returns {ExecutionContext}
   */
  child(overrides = {}) {
    return new ExecutionContext({
      client:         this.client,
      guild:          this.guild,
      member:         this.member,
      channel:        this.channel,
      interaction:    this.interaction,
      message:        this.message,
      trigger:        this.trigger,
      storedDefs:     [],
      storedValues:   [],
      userId:         this.userId,
      commandId:      null,
      executionCount: 0,
      engine:         this.engine,
      depth:       this.depth + 1,
      abortSignal: this.abortSignal,
      ...overrides,
    });
  }
}

module.exports = { ExecutionContext };

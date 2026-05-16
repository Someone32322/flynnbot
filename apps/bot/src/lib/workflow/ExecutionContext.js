'use strict';

/**
 * workflow/ExecutionContext.js
 *
 * Immutable snapshot of the Discord runtime context for a single workflow execution.
 * Passed down through every block executor. Never mutated after construction.
 */

class ExecutionContext {
  /**
   * @param {object} opts
   * @param {import('discord.js').Client}         opts.client
   * @param {import('discord.js').Guild}          opts.guild
   * @param {import('discord.js').GuildMember}    opts.member   — triggering member
   * @param {import('discord.js').TextChannel}    opts.channel  — trigger channel
   * @param {import('discord.js').Message|null}   [opts.message]   — set for message triggers
   * @param {import('discord.js').Interaction|null} [opts.interaction] — set for interaction triggers
   * @param {object}                              [opts.triggerMeta] — extra trigger-specific data
   * @param {import('./WorkflowEngine')}          opts.engine
   */
  constructor({ client, guild, member, channel, message = null, interaction = null, triggerMeta = {}, engine }) {
    if (!client || !guild || !member || !channel) {
      throw new TypeError('ExecutionContext: client, guild, member, and channel are all required.');
    }

    this.client      = client;
    this.guild       = guild;
    this.member      = member;
    this.user        = member.user;
    this.channel     = channel;
    this.message     = message;
    this.interaction = interaction;
    this.triggerMeta = triggerMeta;
    this.engine      = engine;

    // ── Flow state (mutable during execution) ──────────────
    /** @type {Map<string, *>} Variables scoped to this execution only */
    this.flowVars    = new Map();

    /** @type {string|null} The last message/interaction response's message ID */
    this.lastMessageId = null;

    /** @type {string|null} The original reply message ID (slash command deferred) */
    this.originalReplyId = null;

    /** Whether a deferred interaction reply has been sent */
    this.replied     = false;

    /** Set to true by stop_flow / stop_if blocks */
    this.stopped     = false;

    /** Set to true if a fatal block error occurred */
    this.errored     = false;

    /** Loop context stack: [{ index, count }] */
    this.loopStack   = [];
  }

  // ── Convenience getters ────────────────────────────────────

  get guildId()  { return this.guild.id; }
  get memberId() { return this.member.id; }

  /**
   * True if we have a slash command / button / select interaction.
   * Controls whether ephemeral replies are possible.
   */
  get isInteraction() {
    return this.interaction !== null;
  }

  /**
   * Push a loop frame onto the stack.
   * Executors for loop_times use this to expose {loop_index}/{loop_count}.
   * @param {number} total
   */
  pushLoop(total) {
    this.loopStack.push({ index: 0, count: 1, total });
  }

  /** Advance the current loop frame to the next iteration. */
  advanceLoop() {
    const frame = this.loopStack[this.loopStack.length - 1];
    if (frame) { frame.index++; frame.count++; }
  }

  /** Remove the current loop frame. */
  popLoop() {
    this.loopStack.pop();
  }

  /** Current loop frame (or null if not inside a loop). */
  get currentLoop() {
    return this.loopStack.length ? this.loopStack[this.loopStack.length - 1] : null;
  }
}

module.exports = ExecutionContext;

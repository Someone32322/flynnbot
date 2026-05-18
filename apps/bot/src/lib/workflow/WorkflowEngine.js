'use strict';

/**
 * workflow/WorkflowEngine.js
 *
 * The core workflow executor.  Called by event handlers (message, interaction, etc.)
 * whenever a trigger matches a stored Workflow document.
 *
 * Usage:
 *   const engine = new WorkflowEngine(client);
 *   await engine.run(workflowDoc, { guild, member, channel, message });
 */

const ExecutionContext = require('./ExecutionContext');
const VariableManager  = require('./VariableManager');
const BLOCK_EXECUTORS  = require('./blocks/index');
const Workflow         = require('../../models/Workflow');
const { LIMITS, EXEC_STATUS } = require('./types');

// Per-guild, per-workflow cooldown map: key → expiry timestamp
const cooldownMap = new Map();

class WorkflowEngine {
  /**
   * @param {import('discord.js').Client} client
   */
  constructor(client) {
    this.client = client;
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Run a workflow.
   * @param {object} workflow  — Mongoose doc (or lean POJO) from the Workflow model
   * @param {object} triggerData
   * @param {import('discord.js').Guild}       triggerData.guild
   * @param {import('discord.js').GuildMember} triggerData.member
   * @param {import('discord.js').TextChannel} triggerData.channel
   * @param {import('discord.js').Message}     [triggerData.message]
   * @param {import('discord.js').Interaction} [triggerData.interaction]
   * @param {object}                           [triggerData.triggerMeta]
   * @returns {Promise<{ status: string, durationMs: number }>}
   */
  async run(workflow, { guild, member, channel, message = null, interaction = null, triggerMeta = {} }) {
    const startMs = Date.now();

    // ── Permission checks ───────────────────────────────────
    const permResult = this._checkPermissions(workflow, member, channel);
    if (!permResult.ok) {
      if (permResult.reply) {
        await this._sendErrorReply({ message, interaction, channel, text: permResult.reply,
          ephemeral: workflow.permissions?.ephemeralErrors ?? true });
      }
      return { status: EXEC_STATUS.STOPPED, durationMs: Date.now() - startMs };
    }

    // ── Cooldown check ──────────────────────────────────────
    const cooldownResult = this._checkCooldown(workflow, member, guild);
    if (!cooldownResult.ok) {
      if (cooldownResult.reply) {
        await this._sendErrorReply({ message, interaction, channel, text: cooldownResult.reply,
          ephemeral: workflow.permissions?.ephemeralErrors ?? true });
      }
      return { status: EXEC_STATUS.STOPPED, durationMs: Date.now() - startMs };
    }

    // ── Build context ────────────────────────────────────────
    const ctx = new ExecutionContext({
      client: this.client, guild, member, channel, message, interaction, triggerMeta, engine: this,
    });
    const vars = new VariableManager(ctx);
    ctx.vars = vars; // convenience reference for block executors

    // ── Execute with global timeout ───────────────────────────
    let status = EXEC_STATUS.COMPLETED;
    const timeoutHandle = setTimeout(() => {
      ctx.stopped = true;
      ctx.errored = true;
      status = EXEC_STATUS.TIMEOUT;
    }, LIMITS.EXECUTION_TIMEOUT_MS);

    try {
      await this._executeBlocks(workflow.blocks || [], ctx);
      if (ctx.errored) status = EXEC_STATUS.FAILED;
      else if (ctx.stopped) status = EXEC_STATUS.STOPPED;
    } catch (err) {
      status = EXEC_STATUS.FAILED;
      console.error(`[WorkflowEngine] Uncaught error in workflow "${workflow.name}" (${workflow._id}):`, err);
    } finally {
      clearTimeout(timeoutHandle);
    }

    const durationMs = Date.now() - startMs;

    // ── Record metrics (fire-and-forget) ─────────────────────
    Workflow.recordExecution(workflow._id, {
      success:    status === EXEC_STATUS.COMPLETED,
      durationMs,
    }).catch((err) => console.error('[WorkflowEngine] Metrics write error:', err));

    return { status, durationMs };
  }

  // ── Block execution ────────────────────────────────────────

  /**
   * Execute an array of blocks sequentially.
   * @param {object[]} blocks
   * @param {ExecutionContext} ctx
   */
  async _executeBlocks(blocks, ctx) {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks) {
      if (ctx.stopped) break;
      await this._executeBlock(block, ctx);
    }
  }

  /**
   * Execute a single block.
   * @param {object} block
   * @param {ExecutionContext} ctx
   */
  async _executeBlock(block, ctx) {
    if (!block?.type) return;

    const executor = BLOCK_EXECUTORS[block.type];
    if (!executor) {
      console.warn(`[WorkflowEngine] No executor for block type "${block.type}" — skipping.`);
      return;
    }

    try {
      await executor(block.data || {}, ctx, this);
    } catch (err) {
      console.error(`[WorkflowEngine] Block "${block.type}" threw:`, err);
      ctx.errored = true;
      ctx.stopped = true;
    }
  }

  // ── Permission checks ──────────────────────────────────────

  _checkPermissions(workflow, member, channel) {
    const perms = workflow.permissions;
    if (!perms) return { ok: true };

    // Allowed channels
    if (perms.allowedChannels?.length && !perms.allowedChannels.includes(channel.id)) {
      return { ok: false };
    }

    // Allowed roles
    if (perms.allowedRoles?.length) {
      const hasRole = perms.allowedRoles.some((roleId) => member.roles.cache.has(roleId));
      if (!hasRole) {
        return { ok: false, reply: perms.ephemeralErrors ? null : undefined };
      }
    }

    // Required Discord permissions
    if (perms.requiredPermissions?.length) {
      const missing = perms.requiredPermissions.filter(
        (perm) => !member.permissions.has(perm)
      );
      if (missing.length) {
        return { ok: false };
      }
    }

    return { ok: true };
  }

  // ── Cooldown check ─────────────────────────────────────────

  _checkCooldown(workflow, member, guild) {
    const seconds = workflow.permissions?.cooldownSeconds;
    if (!seconds) return { ok: true };

    const scope = workflow.permissions?.cooldownScope ?? 'user';
    const key   = `${workflow._id}:${scope === 'guild' ? guild.id : scope === 'channel' ? 'ch' : member.id}`;
    const now   = Date.now();
    const exp   = cooldownMap.get(key);

    if (exp && now < exp) {
      const remaining = Math.ceil((exp - now) / 1000);
      return { ok: false, reply: `Please wait ${remaining}s before using this again.` };
    }

    cooldownMap.set(key, now + seconds * 1000);

    // Cleanup: remove expired entries every 500 entries to prevent memory leak
    if (cooldownMap.size > 500) {
      for (const [k, v] of cooldownMap) {
        if (v < now) cooldownMap.delete(k);
      }
    }

    return { ok: true };
  }

  // ── Helpers ────────────────────────────────────────────────

  async _sendErrorReply({ message, interaction, channel, text, ephemeral }) {
    try {
      if (interaction && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: text, ephemeral });
      } else if (message) {
        await message.reply({ content: text });
      } else {
        await channel.send({ content: text });
      }
    } catch { /* best-effort */ }
  }
}

module.exports = WorkflowEngine;

/**
 * Workflow Handler — Central workflow trigger system
 *
 * Handles:
 *   - Message-based triggers (prefix commands, contains, regex, exact match)
 *   - Interaction triggers (slash commands, buttons, select menus, modals)
 *   - Event triggers (member join/leave, reactions)
 *
 * This module bridges Discord events and the WorkflowEngine, handling routing
 * and execution context setup.
 */

const Workflow = require('../../models/Workflow');
const WorkflowEngine = require('./WorkflowEngine');
const { getComponentRegistry } = require('./componentRegistry');
const { EXEC_STATUS } = require('./types');

const MESSAGE_TRIGGER_TYPES = ['prefix', 'contains', 'exact', 'regex', 'prefix_command', 'exact_match'];

class WorkflowHandler {
  constructor(client) {
    this.client = client;
    this.engine = new WorkflowEngine(client);
    this.componentRegistry = getComponentRegistry();
    this.executionStats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      errors: [],
    };
  }

  /**
   * Handle message-based workflow triggers
   * Called from messageCreate event
   * @param {Message} message - Discord.js Message object
   */
  async handleMessageTriggers(message) {
    if (!message.guild || message.author.bot) return;

    try {
      // Find workflows with message-based triggers for this guild.
      // Includes legacy aliases for backwards compatibility.
      const triggerTypes = MESSAGE_TRIGGER_TYPES;
      const allWorkflows = await Promise.all(
        triggerTypes.map(type => Workflow.findByTrigger(message.guild.id, type))
      );
      const workflows = allWorkflows
        .flat()
        .filter((wf, idx, arr) => arr.findIndex((x) => String(x._id) === String(wf._id)) === idx);

      for (const workflow of workflows) {
        if (!workflow.enabled) continue;

        const match = this._matchMessageTrigger(message, workflow.trigger);
        if (!match.matched) continue;

        await this._executeWorkflow(workflow, {
          guild: message.guild,
          member: message.member,
          channel: message.channel,
          message,
          triggerMeta: {
            triggerType: workflow.trigger.type,
            matchedValue: workflow.trigger.value,
            args: match.args,
            argsNamed: match.argsNamed,
            commandName: match.commandName,
          },
        });
      }
    } catch (err) {
      console.error('[WorkflowHandler] Error in handleMessageTriggers:', err);
      this.recordError(err);
    }
  }

  /**
   * Handle interaction-based workflow triggers
   * Called from interactionCreate event
   * @param {Interaction} interaction - Discord.js Interaction object
   */
  async handleInteractionTriggers(interaction) {
    if (!interaction.guild) return;

    try {
      // Handle slash commands
      if (interaction.isChatInputCommand()) {
        await this._handleSlashCommand(interaction);
        return;
      }

      // Handle buttons
      if (interaction.isButton()) {
        await this._handleButton(interaction);
        return;
      }

      // Handle select menus
      if (interaction.isStringSelectMenu()) {
        await this._handleSelectMenu(interaction);
        return;
      }

      // Handle modal submissions
      if (interaction.isModalSubmit()) {
        await this._handleModalSubmit(interaction);
        return;
      }
    } catch (err) {
      console.error('[WorkflowHandler] Error in handleInteractionTriggers:', err);
      this.recordError(err);
    }
  }

  /**
   * Handle member join events
   * @param {GuildMember} member - Discord.js GuildMember object
   */
  async handleMemberJoin(member) {
    if (!member.guild) return;

    try {
      const workflows = await Workflow.findByTrigger(member.guild.id, 'member_join');
      const channel = this._resolveGuildDefaultChannel(member.guild);
      if (!channel) return;

      for (const workflow of workflows) {
        if (!workflow.enabled) continue;

        await this._executeWorkflow(workflow, {
          guild: member.guild,
          member,
          channel,
          message: null,
          triggerMeta: { triggerType: 'member_join' },
        });
      }
    } catch (err) {
      console.error('[WorkflowHandler] Error in handleMemberJoin:', err);
      this.recordError(err);
    }
  }

  /**
   * Handle member leave events
   * @param {GuildMember} member - Discord.js GuildMember object
   */
  async handleMemberLeave(member) {
    if (!member.guild) return;

    try {
      const workflows = await Workflow.findByTrigger(member.guild.id, 'member_leave');
      const channel = this._resolveGuildDefaultChannel(member.guild);
      if (!channel) return;

      for (const workflow of workflows) {
        if (!workflow.enabled) continue;

        await this._executeWorkflow(workflow, {
          guild: member.guild,
          member,
          channel,
          message: null,
          triggerMeta: { triggerType: 'member_leave' },
        });
      }
    } catch (err) {
      console.error('[WorkflowHandler] Error in handleMemberLeave:', err);
      this.recordError(err);
    }
  }

  /**
   * Handle reaction add events
   * @param {MessageReaction} reaction - Discord.js MessageReaction object
   * @param {User} user - Discord.js User object
   */
  async handleReactionAdd(reaction, user) {
    if (!reaction.message.guild || user.bot) return;

    try {
      const workflows = await Workflow.findByTrigger(
        reaction.message.guild.id,
        'reaction'
      );

      for (const workflow of workflows) {
        if (!workflow.enabled) continue;

        // Match emoji if trigger has a specific value
        if (workflow.trigger.value && reaction.emoji.name !== workflow.trigger.value) {
          continue;
        }

        const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
        if (!member) continue;

        await this._executeWorkflow(workflow, {
          guild: reaction.message.guild,
          member,
          channel: reaction.message.channel,
          message: reaction.message,
          triggerMeta: {
            triggerType: 'reaction_add',
            emoji: reaction.emoji.name,
            userId: user.id,
          },
        });
      }
    } catch (err) {
      console.error('[WorkflowHandler] Error in handleReactionAdd:', err);
      this.recordError(err);
    }
  }

  // ── Private helper methods ──────────────────────────────────

  _matchMessageTrigger(message, trigger) {
    const content = message.content.toLowerCase();
    const triggerValue = trigger.value?.toLowerCase() || '';

    const extractPrefix = () => {
      const parsed = this._extractPrefixArgs(message, trigger);
      if (!parsed) return { matched: false, args: [], argsNamed: {}, commandName: '' };
      return {
        matched: true,
        args: parsed.args,
        argsNamed: parsed.argsNamed,
        commandName: parsed.commandName,
      };
    };

    switch (trigger.type) {
      case 'prefix_command':
      case 'prefix':
        return extractPrefix();

      case 'contains':
        return { matched: content.includes(triggerValue), args: [], argsNamed: {}, commandName: '' };

      case 'exact_match':
      case 'exact':
        return { matched: content === triggerValue, args: [], argsNamed: {}, commandName: '' };

      case 'regex': {
        try {
          const re = new RegExp(triggerValue, 'i');
          return { matched: re.test(content), args: [], argsNamed: {}, commandName: '' };
        } catch {
          console.warn(`[WorkflowHandler] Invalid regex trigger: ${triggerValue}`);
          return { matched: false, args: [], argsNamed: {}, commandName: '' };
        }
      }

      default:
        return { matched: false, args: [], argsNamed: {}, commandName: '' };
    }
  }

  _extractPrefixArgs(message, trigger) {
    const prefix = process.env.BOT_PREFIX || '!';
    if (!message.content.startsWith(prefix)) return null;

    const text = message.content.slice(prefix.length).trim();
    if (!text) return null;

    const parts = text.split(/\s+/);
    const commandName = String(parts[0] || '').toLowerCase();
    const expected = String(trigger?.value || '').toLowerCase();
    if (!commandName || !expected || commandName !== expected) return null;

    const args = parts.slice(1);
    const argsNamed = {};
    if (Array.isArray(trigger?.options) && trigger.options.length) {
      for (let i = 0; i < trigger.options.length; i++) {
        const opt = trigger.options[i];
        if (!opt?.name) continue;
        argsNamed[opt.name] = i === trigger.options.length - 1 ? args.slice(i).join(' ') : (args[i] ?? '');
      }
    }

    return { commandName, args, argsNamed };
  }

  async _handleSlashCommand(interaction) {
    const workflows = await Workflow.findByTrigger(interaction.guild.id, 'slash');
    if (!workflows?.length) return;

    const commandName = String(interaction.commandName || '').toLowerCase();
    for (const workflow of workflows) {
      if (!workflow.enabled) continue;
      const triggerName = String(workflow.trigger?.value || '').toLowerCase();
      if (!triggerName || triggerName !== commandName) continue;

      const argsNamed = {};
      if (interaction.options && Array.isArray(workflow.trigger?.options)) {
        for (const opt of workflow.trigger.options) {
          if (!opt?.name) continue;
          const str = interaction.options.getString(opt.name, false);
          if (str !== null && str !== undefined) {
            argsNamed[opt.name] = str;
            continue;
          }
          const num = interaction.options.getNumber(opt.name, false);
          if (num !== null && num !== undefined) {
            argsNamed[opt.name] = String(num);
            continue;
          }
          const bool = interaction.options.getBoolean(opt.name, false);
          if (bool !== null && bool !== undefined) {
            argsNamed[opt.name] = String(bool);
            continue;
          }
          const user = interaction.options.getUser(opt.name, false);
          if (user) {
            argsNamed[opt.name] = `<@${user.id}>`;
            argsNamed[`${opt.name}Id`] = user.id;
          }
        }
      }

      await this._executeWorkflow(workflow, {
        guild: interaction.guild,
        member: interaction.member,
        channel: interaction.channel,
        interaction,
        triggerMeta: {
          triggerType: 'slash',
          commandName,
          args: Object.values(argsNamed),
          argsNamed,
        },
      });
    }
  }

  async _handleButton(interaction) {
    // Check if this is a workflow button
    const meta = this.componentRegistry.resolve(interaction.customId);
    if (!meta || meta.type !== 'button') return;

    const workflow = await Workflow.findById(meta.workflowId).lean();
    if (!workflow) return;

    // Defer to prevent "interaction failed" error
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: meta.ephemeral }).catch(() => null);
    }

    await this._executeWorkflow(workflow, {
      guild: interaction.guild,
      member: interaction.member,
      channel: interaction.channel,
      interaction,
      triggerMeta: {
        triggerType: 'button_click',
        buttonId: meta.blockId,
        actionData: meta.actionData,
      },
    });
  }

  async _handleSelectMenu(interaction) {
    // Check if this is a workflow select menu
    const meta = this.componentRegistry.resolve(interaction.customId);
    if (!meta || meta.type !== 'selectMenu') return;

    const workflow = await Workflow.findById(meta.workflowId).lean();
    if (!workflow) return;

    // Defer to prevent "interaction failed" error
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: meta.ephemeral }).catch(() => null);
    }

    await this._executeWorkflow(workflow, {
      guild: interaction.guild,
      member: interaction.member,
      channel: interaction.channel,
      interaction,
      triggerMeta: {
        triggerType: 'select_menu',
        selectedValues: interaction.values,
        actionData: meta.actionData,
      },
    });
  }

  async _handleModalSubmit(interaction) {
    // Check if this is a workflow modal submission
    const meta = this.componentRegistry.resolve(interaction.customId);
    if (!meta || meta.type !== 'modal') return;

    const workflow = await Workflow.findById(meta.workflowId).lean();
    if (!workflow) return;

    // Defer to prevent "interaction failed" error
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: meta.ephemeral }).catch(() => null);
    }

    const fields = {};
    interaction.fields.fields.forEach((field) => {
      fields[field.customId] = field.value;
    });

    await this._executeWorkflow(workflow, {
      guild: interaction.guild,
      member: interaction.member,
      channel: interaction.channel,
      interaction,
      triggerMeta: {
        triggerType: 'modal_submit',
        modalFields: fields,
        actionData: meta.actionData,
      },
    });
  }

  async _executeWorkflow(workflow, context) {
    this.executionStats.totalExecutions++;

    try {
      const result = await this.engine.run(workflow, context);

      if (result.status === EXEC_STATUS.COMPLETED) {
        this.executionStats.successfulExecutions++;
      } else {
        this.executionStats.failedExecutions++;
        console.warn(`[WorkflowHandler] Workflow did not complete: ${workflow._id} [${result.status}]`);
      }

      return result;
    } catch (err) {
      this.executionStats.failedExecutions++;
      this.recordError(err);
      console.error(`[WorkflowHandler] Error executing workflow ${workflow._id}:`, err);
      throw err;
    }
  }

  recordError(err) {
    this.executionStats.errors.push({
      timestamp: Date.now(),
      message: err.message,
      stack: err.stack?.split('\n').slice(0, 3).join('\n'),
    });

    // Keep only last 100 errors
    if (this.executionStats.errors.length > 100) {
      this.executionStats.errors.shift();
    }
  }

  getStats() {
    return {
      ...this.executionStats,
      componentRegistry: this.componentRegistry.getStats(),
    };
  }

  _resolveGuildDefaultChannel(guild) {
    if (!guild) return null;
    if (guild.systemChannel) return guild.systemChannel;
    const textLike = guild.channels?.cache?.find((ch) => {
      try {
        return ch && typeof ch.send === 'function' && ch.viewable;
      } catch {
        return false;
      }
    });
    return textLike || null;
  }

  /**
   * Cleanup before shutdown
   */
  destroy() {
    if (this.engine) {
      this.engine.destroy?.();
    }
  }
}

module.exports = WorkflowHandler;

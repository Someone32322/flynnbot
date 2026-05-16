/**
 * Workflow Hooks — Integration points for Discord events
 *
 * These are helper functions called from the main event handlers
 * (messageCreate, interactionCreate, etc.) to trigger workflows.
 *
 * This keeps the event handlers clean and the workflow system modular.
 */

let workflowHandler = null;

/**
 * Initialize the workflow system with a Discord client
 * Should be called once at bot startup
 * @param {Client} client - Discord.js Client
 */
function initializeWorkflows(client) {
  if (workflowHandler) return workflowHandler;

  try {
    const WorkflowHandler = require('./handler');
    workflowHandler = new WorkflowHandler(client);
    console.log('[Workflows] Handler initialized successfully');
    return workflowHandler;
  } catch (err) {
    console.error('[Workflows] Failed to initialize:', err);
    return null;
  }
}

/**
 * Hook: Call from messageCreate event
 * @param {Message} message - Discord.js Message
 */
async function onMessageCreate(message) {
  if (!workflowHandler) return;
  try {
    await workflowHandler.handleMessageTriggers(message);
  } catch (err) {
    console.error('[Workflows] Error in messageCreate hook:', err);
  }
}

/**
 * Hook: Call from interactionCreate event
 * @param {Interaction} interaction - Discord.js Interaction
 */
async function onInteractionCreate(interaction) {
  if (!workflowHandler) return;
  try {
    await workflowHandler.handleInteractionTriggers(interaction);
  } catch (err) {
    console.error('[Workflows] Error in interactionCreate hook:', err);
  }
}

/**
 * Hook: Call from guildMemberAdd event
 * @param {GuildMember} member - Discord.js GuildMember
 */
async function onMemberJoin(member) {
  if (!workflowHandler) return;
  try {
    await workflowHandler.handleMemberJoin(member);
  } catch (err) {
    console.error('[Workflows] Error in memberJoin hook:', err);
  }
}

/**
 * Hook: Call from guildMemberRemove event
 * @param {GuildMember} member - Discord.js GuildMember
 */
async function onMemberLeave(member) {
  if (!workflowHandler) return;
  try {
    await workflowHandler.handleMemberLeave(member);
  } catch (err) {
    console.error('[Workflows] Error in memberLeave hook:', err);
  }
}

/**
 * Hook: Call from messageReactionAdd event
 * @param {MessageReaction} reaction - Discord.js MessageReaction
 * @param {User} user - Discord.js User
 */
async function onReactionAdd(reaction, user) {
  if (!workflowHandler) return;
  try {
    await workflowHandler.handleReactionAdd(reaction, user);
  } catch (err) {
    console.error('[Workflows] Error in reactionAdd hook:', err);
  }
}

/**
 * Get the workflow handler instance
 * @returns {WorkflowHandler|null}
 */
function getWorkflowHandler() {
  return workflowHandler;
}

/**
 * Get workflow system statistics
 * @returns {object|null}
 */
function getWorkflowStats() {
  if (!workflowHandler) return null;
  return workflowHandler.getStats();
}

/**
 * Shutdown the workflow system
 */
function destroyWorkflows() {
  if (workflowHandler) {
    workflowHandler.destroy();
    workflowHandler = null;
  }
}

module.exports = {
  initializeWorkflows,
  onMessageCreate,
  onInteractionCreate,
  onMemberJoin,
  onMemberLeave,
  onReactionAdd,
  getWorkflowHandler,
  getWorkflowStats,
  destroyWorkflows,
};

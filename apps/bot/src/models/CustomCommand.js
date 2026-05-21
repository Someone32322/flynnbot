'use strict';

const mongoose = require('mongoose');

// ── Sub-schemas ───────────────────────────────────────────────

const blockSchema = new mongoose.Schema({
  type: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

/**
 * eventTrigger — for event-based triggers (member_join, reaction_add, etc.)
 * Only populated when triggerType is an event type.
 */
const eventTriggerSchema = new mongoose.Schema({
  // For reaction triggers: only fire when emoji matches (if set)
  emoji:     { type: String, default: null },
  // For reaction/message triggers: only fire for this message ID
  messageId: { type: String, default: null },
  // For reaction/event triggers: only fire in this channel
  channelId: { type: String, default: null },
  // For scheduled triggers: cron-like interval ('5m', '1h', '1d')
  interval:  { type: String, default: null },
}, { _id: false });

const metadataSchema = new mongoose.Schema({
  executionCount:       { type: Number, default: 0 },
  lastExecutedAt:       { type: Date,   default: null },
  lastExecutionStatus:  { type: String, default: null },
  avgExecutionTimeMs:   { type: Number, default: 0 },
  errorCount:           { type: Number, default: 0 },
}, { _id: false });

// ── Main schema ───────────────────────────────────────────────

const customCommandSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  name:    { type: String, required: true, maxlength: 50 },

  // Trigger configuration
  trigger:     { type: String, required: true, maxlength: 200 },
  triggerType: {
    type:    String,
    enum:    ['slash', 'prefix', 'exact', 'contains', 'startsWith', 'regex',
              'button', 'select_menu',
              'member_join', 'member_leave',
              'reaction_add', 'reaction_remove',
              'voice_join', 'voice_leave',
              'message_delete', 'scheduled'],
    default: 'exact',
  },
  eventTrigger:  { type: eventTriggerSchema, default: null },

  // Human-readable description (shown as slash command description on Discord)
  description: { type: String, default: '', maxlength: 100 },

  // ── Permissions / restrictions ──────────────────────────────
  allowedRoles:        { type: [String], default: [] },
  allowedChannels:     { type: [String], default: [] },
  requiredPermissions: { type: [String], default: [] },
  cooldownSeconds:     { type: Number, default: 0, min: 0, max: 86400 },
  cooldownScope:       { type: String, enum: ['user', 'guild', 'channel'], default: 'user' },
  caseSensitive:       { type: Boolean, default: false },
  deleteUserMessage:   { type: Boolean, default: false },
  ephemeralErrors:     { type: Boolean, default: true },

  // ── Block-based workflow ────────────────────────────────────
  blocks: { type: [blockSchema], default: [] },

  // ── Organization ───────────────────────────────────────────
  tags:     { type: [String], default: [] },
  category: { type: String, default: '' },

  // ── Slash command options ───────────────────────────────────
  slashOptions: {
    type: [{
      name:        { type: String, required: true, maxlength: 32 },
      type:        { type: Number, default: 3 }, // 3=STRING
      description: { type: String, default: '', maxlength: 100 },
      required:    { type: Boolean, default: false },
      choices:     { type: mongoose.Schema.Types.Mixed, default: [] },
    }],
    default: [],
  },

  // ── Execution metadata ──────────────────────────────────────
  metadata: { type: metadataSchema, default: () => ({}) },

  // ── State ───────────────────────────────────────────────────
  enabled: { type: Boolean, default: true },

  // ── Legacy fields kept for backward compatibility ───────────
  response:         { type: String, default: '', maxlength: 2000 },
  type:             { type: String, enum: ['text', 'embed'], default: 'text' },
  embedColor:       { type: String, default: '#0f52ba' },
  embedTitle:       { type: String, default: '', maxlength: 256 },
  embedDescription: { type: String, default: '', maxlength: 2000 },
  variables:        { type: mongoose.Schema.Types.Mixed, default: {} },

  // Discord registered slash-command ID (for deregistration)
  discordCommandId: { type: String, default: '' },
}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────
customCommandSchema.index({ guildId: 1, name: 1 }, { unique: true });
customCommandSchema.index({ guildId: 1, enabled: 1 });
customCommandSchema.index({ guildId: 1, triggerType: 1 });

// ── Statics ───────────────────────────────────────────────────

/**
 * Record an execution result (fire-and-forget safe).
 * @param {string} id           — Mongoose ObjectId string
 * @param {object} opts
 * @param {boolean} opts.success
 * @param {number}  opts.durationMs
 */
customCommandSchema.statics.recordExecution = async function recordExecution(id, { success, durationMs }) {
  if (!id) return;
  try {
    const inc = { 'metadata.executionCount': 1 };
    if (!success) inc['metadata.errorCount'] = 1;
    const avg = Number.isFinite(durationMs) ? durationMs : 0;
    await this.findByIdAndUpdate(id, {
      $inc: inc,
      $set: {
        'metadata.lastExecutedAt':      new Date(),
        'metadata.lastExecutionStatus': success ? 'completed' : 'failed',
        'metadata.avgExecutionTimeMs':  avg,
      },
    });
  } catch {
    // non-fatal — metrics loss is acceptable
  }
};

module.exports = mongoose.models.CustomCommand || mongoose.model('CustomCommand', customCommandSchema);

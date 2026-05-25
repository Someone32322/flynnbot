'use strict';

const mongoose = require('mongoose');

// ─────────────────────────────────────────────
// Sub-schemas
// ─────────────────────────────────────────────

const slashChoiceSchema = new mongoose.Schema({
  name:  { type: String, required: true, maxlength: 100 },
  value: { type: String, required: true, maxlength: 100 },
}, { _id: false });

const slashOptionSchema = new mongoose.Schema({
  name:         { type: String, required: true, maxlength: 32 },
  type:         { type: Number, required: true }, // 3=STRING 4=INTEGER 5=BOOLEAN 6=USER 7=CHANNEL 8=ROLE 10=NUMBER 11=ATTACHMENT
  description:  { type: String, default: '', maxlength: 100 },
  required:     { type: Boolean, default: false },
  autocomplete: { type: Boolean, default: false },
  choices:      { type: [slashChoiceSchema], default: [] },
  minValue:     { type: Number, default: null },
  maxValue:     { type: Number, default: null },
  minLength:    { type: Number, default: null },
  maxLength:    { type: Number, default: null },
  channelTypes: { type: [Number], default: [] },
}, { _id: false });

// ─────────────────────────────────────────────
// All valid trigger types
// ─────────────────────────────────────────────
const TRIGGER_TYPES = [
  // Text / slash
  'slash', 'prefix', 'contains', 'exact', 'startsWith', 'regex',
  // Components
  'button', 'select_menu', 'modal_submit',
  // Events
  'member_join', 'member_leave',
  'reaction_add', 'reaction_remove',
  'voice_join', 'voice_leave',
  'message_delete', 'message_edit',
  'scheduled',
];

const triggerSchema = new mongoose.Schema({
  type:    { type: String, enum: TRIGGER_TYPES, required: true },
  value:   { type: String, default: '', maxlength: 200 },
  options: { type: [slashOptionSchema], default: [] },
  // trigger-type-specific config (emoji, channelId, interval, matchType, etc.)
  // validated at the application layer, not here
  config:  { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const cooldownSchema = new mongoose.Schema({
  seconds: { type: Number, default: 0, min: 0, max: 86400 },
  scope:   { type: String, enum: ['user', 'guild', 'channel'], default: 'user' },
}, { _id: false });

const conditionsSchema = new mongoose.Schema({
  allowedRoles:        { type: [String], default: [] },
  ignoredRoles:        { type: [String], default: [] },
  allowedChannels:     { type: [String], default: [] },
  ignoredChannels:     { type: [String], default: [] },
  requiredPermissions: { type: [String], default: [] },
  cooldown:            { type: cooldownSchema, default: () => ({}) },
  caseSensitive:       { type: Boolean, default: false },
  deleteUserMessage:   { type: Boolean, default: false },
  ephemeralReply:      { type: Boolean, default: false },
}, { _id: false });

const blockSchema = new mongoose.Schema({
  // client-side UUID — optional, not used server-side for logic
  id:   { type: String, default: '' },
  type: { type: String, required: true, maxlength: 64 },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const metadataSchema = new mongoose.Schema({
  executionCount:      { type: Number, default: 0 },
  lastExecutedAt:      { type: Date,   default: null },
  lastExecutionStatus: { type: String, default: null }, // 'success' | 'error' | 'partial'
  avgExecutionTimeMs:  { type: Number, default: 0 },
  errorCount:          { type: Number, default: 0 },
}, { _id: false });

// ─────────────────────────────────────────────
// Main schema
// ─────────────────────────────────────────────

const guildCommandSchema = new mongoose.Schema({
  guildId:     { type: String, required: true, index: true },
  name:        { type: String, required: true, maxlength: 50 },
  description: { type: String, default: '', maxlength: 100 },
  enabled:     { type: Boolean, default: true },
  tags:        { type: [String], default: [] },

  trigger:    { type: triggerSchema, required: true },
  conditions: { type: conditionsSchema, default: () => ({}) },
  blocks:     { type: [blockSchema], default: [] },

  // Persistent variables — survive across executions
  storedVars: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Discord slash command ID (for deregistration/updates)
  discordCommandId: { type: String, default: null },

  metadata: { type: metadataSchema, default: () => ({}) },
}, {
  timestamps: true,
  collection: 'guildcommands',
});

// Compound index: fast lookup by guild + name, unique per guild
guildCommandSchema.index({ guildId: 1, name: 1 }, { unique: true });
// Fast lookup by trigger type for event routing
guildCommandSchema.index({ guildId: 1, 'trigger.type': 1, enabled: 1 });
// Scheduled commands lookup
guildCommandSchema.index({ 'trigger.type': 1, enabled: 1 });

// ─────────────────────────────────────────────
// Statics
// ─────────────────────────────────────────────

/**
 * Record an execution result against a command.
 * Uses $inc and $set to avoid race conditions.
 */
guildCommandSchema.statics.recordExecution = async function (cmdId, { status, durationMs }) {
  return this.findByIdAndUpdate(cmdId, {
    $inc: {
      'metadata.executionCount': 1,
      'metadata.errorCount': status === 'error' ? 1 : 0,
    },
    $set: {
      'metadata.lastExecutedAt': new Date(),
      'metadata.lastExecutionStatus': status,
      'metadata.avgExecutionTimeMs': durationMs,
    },
  }, { new: false }).catch(() => null); // fire-and-forget friendly
};

// ─────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────

const GuildCommand = mongoose.model('GuildCommand', guildCommandSchema);

module.exports = { GuildCommand, TRIGGER_TYPES };

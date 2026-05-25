'use strict';

/**
 * StoredVariableValue — The actual PERSISTED VALUES for stored variables
 *
 * Each document represents one resolved value for a given definition,
 * isolated by scope (guild / user / command).
 *
 * Bot reads these at execution start and writes back dirty values afterward.
 * Dashboard reads these to show current values and allow manual editing/reset.
 */

const mongoose = require('mongoose');

const StoredVariableValueSchema = new mongoose.Schema({
  // Reference to the StoredVariable definition
  definitionId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'StoredVariable',
    required: true,
    index:    true,
  },

  guildId: {
    type:     String,
    required: true,
    index:    true,
  },

  scope: {
    type:     String,
    enum:     ['guild', 'user', 'command'],
    required: true,
  },

  // Populated when scope = 'user' — the Discord user ID
  userId: {
    type:    String,
    default: null,
  },

  // Populated when scope = 'command' — the GuildCommand _id as string
  commandId: {
    type:    String,
    default: null,
  },

  // The actual stored value (type-specific: string, number, array, object, etc.)
  value: {
    type:     mongoose.Schema.Types.Mixed,
    required: true,
  },

}, {
  timestamps:  { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  collection:  'storedvariablevalues',
});

// ── Indexes ────────────────────────────────────────────────────────

// Primary lookup: find a user's value for a specific variable
StoredVariableValueSchema.index({ definitionId: 1, userId: 1 });
// Bulk load: all values for a user in a guild
StoredVariableValueSchema.index({ guildId: 1, scope: 1, userId: 1 });
// Command-scoped cleanup
StoredVariableValueSchema.index({ commandId: 1, scope: 1 });

// ── Unique constraints ─────────────────────────────────────────────

// Only one guild-scoped value per definition
StoredVariableValueSchema.index(
  { definitionId: 1, scope: 1 },
  { unique: true, partialFilterExpression: { scope: 'guild' } }
);

// Only one user-scoped value per definition per user
StoredVariableValueSchema.index(
  { definitionId: 1, userId: 1, scope: 1 },
  { unique: true, partialFilterExpression: { scope: 'user' } }
);

// ── Model ──────────────────────────────────────────────────────────

const StoredVariableValue = mongoose.model('StoredVariableValue', StoredVariableValueSchema);

module.exports = { StoredVariableValue };

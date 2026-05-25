'use strict';

/**
 * StoredVariable — Variable DEFINITION (the schema/blueprint)
 *
 * Defines what stored variables exist, their types, scopes, and configuration.
 * These are created and managed via the dashboard Data Storage section.
 *
 * See StoredVariableValue.js for the actual persisted values.
 */

const mongoose = require('mongoose');

const VARIABLE_TYPES  = ['text', 'number', 'user', 'channel', 'collection', 'object'];
const VARIABLE_SCOPES = ['guild', 'user', 'command'];
const USER_DATA_TYPES    = ['id', 'username', 'mention'];
const CHANNEL_DATA_TYPES = ['id', 'name', 'mention'];
const ITEM_TYPES = ['text', 'number', 'boolean', 'user', 'channel'];

// ── Object property schema ─────────────────────────────────────────

const ObjectPropertySchema = new mongoose.Schema({
  name:         { type: String, required: true, maxlength: 64, trim: true },
  refName:      { type: String, required: true, maxlength: 64, trim: true,
                  match: [/^[a-z0-9_-]{1,64}$/, 'Property refName must be lowercase alphanumeric, hyphens, or underscores'] },
  type:         { type: String, enum: ['text', 'number', 'boolean'], default: 'text' },
  required:     { type: Boolean, default: false },
  defaultValue: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

// ── Main schema ────────────────────────────────────────────────────

const StoredVariableSchema = new mongoose.Schema({
  guildId: {
    type:     String,
    required: true,
    index:    true,
  },

  // Display name (e.g. "User Points")
  name: {
    type:      String,
    required:  true,
    maxlength: 100,
    trim:      true,
  },

  // Reference name used in placeholders: {stored.refName}
  // e.g. "userPoints" -> {stored.userPoints}
  refName: {
    type:      String,
    required:  true,
    maxlength: 64,
    trim:      true,
    match:     [/^[a-z0-9_-]{1,64}$/, 'refName must be lowercase alphanumeric, hyphens, or underscores'],
  },

  description: {
    type:      String,
    maxlength: 200,
    default:   '',
    trim:      true,
  },

  // Variable type determines storage format and resolution behavior
  type: {
    type:     String,
    enum:     VARIABLE_TYPES,
    required: true,
  },

  // Scope determines how values are isolated
  //   guild   → one value shared across the whole server
  //   user    → one value per server member
  //   command → one value per command definition (resets per execution or persists?)
  scope: {
    type:     String,
    enum:     VARIABLE_SCOPES,
    required: true,
  },

  enabled: {
    type:    Boolean,
    default: true,
  },

  // Type-specific configuration
  config: {
    // Default value when variable has never been set
    defaultValue: {
      type:    mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ── text ──────────────────────────────────────────────────────
    maxLength: {
      type:    Number,
      min:     0,
      max:     2000,
      default: null,
    },

    // ── number ────────────────────────────────────────────────────
    isFloat: {
      type:    Boolean,
      default: false,
    },
    min: {
      type:    Number,
      default: null,
    },
    max: {
      type:    Number,
      default: null,
    },

    // ── user ──────────────────────────────────────────────────────
    // What gets returned when you use {stored.refName} for a user variable
    userDataType: {
      type:    String,
      enum:    USER_DATA_TYPES,
      default: 'id',
    },

    // ── channel ───────────────────────────────────────────────────
    channelDataType: {
      type:    String,
      enum:    CHANNEL_DATA_TYPES,
      default: 'id',
    },

    // ── collection ────────────────────────────────────────────────
    itemType: {
      type:    String,
      enum:    ITEM_TYPES,
      default: 'text',
    },
    maxSize: {
      type:    Number,
      min:     1,
      max:     1000,
      default: 100,
    },

    // ── object ────────────────────────────────────────────────────
    properties: {
      type:    [ObjectPropertySchema],
      default: [],
    },
  },

}, {
  timestamps:  true,
  collection:  'storedvariables',
});

// ── Indexes ────────────────────────────────────────────────────────

// Unique: one variable per refName per guild
StoredVariableSchema.index({ guildId: 1, refName: 1 }, { unique: true });
StoredVariableSchema.index({ guildId: 1, type: 1 });
StoredVariableSchema.index({ guildId: 1, scope: 1 });

// ── Model ──────────────────────────────────────────────────────────

const StoredVariable = mongoose.model('StoredVariable', StoredVariableSchema);

module.exports = { StoredVariable, VARIABLE_TYPES, VARIABLE_SCOPES, ITEM_TYPES };

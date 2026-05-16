/**
 * WorkflowVariable.js — Persistent variable storage for custom command workflows
 *
 * Scopes:
 *  - user  (userId = user's Discord ID, scoped to guild+user)
 *  - guild (userId = null, scoped to guild only)
 */
const mongoose = require('mongoose');

const WFVarSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId:  { type: String, default: null }, // null = guild scope
  key:     { type: String, required: true, maxlength: 32 },
  value:   { type: String, default: '' },
}, {
  collection: 'workflowvariables',
  timestamps: { createdAt: false, updatedAt: 'updatedAt' },
});

// Compound unique index for fast lookups
WFVarSchema.index({ guildId: 1, userId: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('WorkflowVariable', WFVarSchema);

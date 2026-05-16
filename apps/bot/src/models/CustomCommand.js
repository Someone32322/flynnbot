const mongoose = require('mongoose');

const blockSchema = new mongoose.Schema({
  type: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const customCommandSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  name: { type: String, required: true, maxlength: 50 },
  trigger: { type: String, required: true, maxlength: 200 },
  triggerType: { type: String, enum: ['slash', 'prefix', 'exact', 'contains', 'startsWith', 'regex'], default: 'exact' },
  description: { type: String, default: '', maxlength: 100 },
  // Legacy fields kept for backward compatibility
  response: { type: String, default: '', maxlength: 2000 },
  type: { type: String, enum: ['text', 'embed'], default: 'text' },
  embedColor: { type: String, default: '#0f52ba' },
  embedTitle: { type: String, default: '', maxlength: 256 },
  embedDescription: { type: String, default: '', maxlength: 2000 },
  // New block-based actions
  blocks: { type: [blockSchema], default: [] },
  enabled: { type: Boolean, default: true },
  allowedRoles: { type: [String], default: [] },
  allowedChannels: { type: [String], default: [] },
  cooldownSeconds: { type: Number, default: 0, min: 0, max: 86400 },
  deleteUserMessage: { type: Boolean, default: false },
  caseSensitive: { type: Boolean, default: false },
}, { timestamps: true });

customCommandSchema.index({ guildId: 1, name: 1 }, { unique: true });
customCommandSchema.index({ guildId: 1, enabled: 1 });

module.exports = mongoose.models.CustomCommand || mongoose.model('CustomCommand', customCommandSchema);

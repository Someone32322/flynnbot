const mongoose = require('mongoose');

const responseOverrideSchema = new mongoose.Schema({
  commandName: { type: String, required: true },
  template: { type: String, required: true, maxlength: 2000 },
}, { _id: false });

const responseConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  overrides: { type: [responseOverrideSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.models.ResponseConfig || mongoose.model('ResponseConfig', responseConfigSchema);

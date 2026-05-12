const mongoose = require('mongoose');

const escalationRuleSchema = new mongoose.Schema({
  warnCount: { type: Number, required: true },
  action: { type: String, enum: ['mute', 'kick', 'ban', 'tempmute'], required: true },
  duration: { type: Number, default: 0 }, // minutes, for tempmute
}, { _id: false });

const escalationConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  rules: { type: [escalationRuleSchema], default: [] },
}, { timestamps: true });

const EscalationConfig = mongoose.models.EscalationConfig
  || mongoose.model('EscalationConfig', escalationConfigSchema);

module.exports = { EscalationConfig };

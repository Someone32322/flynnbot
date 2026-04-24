const mongoose = require('mongoose');

const predefinedReasonsSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    action:  { type: String, required: true }, // 'warn', 'mute', 'kick', 'ban', 'softban', 'note', 'temprole'
    reasons: { type: [String], default: [] },
  },
  { timestamps: true }
);

predefinedReasonsSchema.index({ guildId: 1, action: 1 }, { unique: true });

const PredefinedReasons =
  mongoose.models.PredefinedReasons || mongoose.model('PredefinedReasons', predefinedReasonsSchema);

module.exports = { PredefinedReasons };

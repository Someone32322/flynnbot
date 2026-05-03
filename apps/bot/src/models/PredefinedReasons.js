const mongoose = require('mongoose');

/**
 * Each reason has:
 *   name  — display label shown in autocomplete
 *   value — actual reason text sent
 */
const predefinedReasonsSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    action:  { type: String, required: true }, // 'warn', 'mute', 'kick', 'ban', 'softban', 'note', 'temprole'
    reasons: [
      {
        name:  { type: String, required: true, maxlength: 100 },
        value: { type: String, required: true, maxlength: 512 },
        _id: false,
      }
    ],
  },
  { timestamps: true }
);

predefinedReasonsSchema.index({ guildId: 1, action: 1 }, { unique: true });

const PredefinedReasons =
  mongoose.models.PredefinedReasons || mongoose.model('PredefinedReasons', predefinedReasonsSchema);

module.exports = { PredefinedReasons };

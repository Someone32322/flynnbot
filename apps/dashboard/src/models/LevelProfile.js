const mongoose = require('mongoose');

const levelProfileSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    xp: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

levelProfileSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const LevelProfile =
  mongoose.models.LevelProfile || mongoose.model('LevelProfile', levelProfileSchema);

module.exports = { LevelProfile };

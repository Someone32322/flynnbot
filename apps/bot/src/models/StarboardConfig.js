const mongoose = require('mongoose');

const starboardConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  channelId: { type: String, default: null },
  threshold: { type: Number, default: 3, min: 1, max: 50 },
  emoji: { type: String, default: '⭐' },
  ignoreSelfStars: { type: Boolean, default: true },
  ignoreNsfw: { type: Boolean, default: true },
  ignoredChannels: { type: [String], default: [] },
}, { timestamps: true });

const StarboardConfig = mongoose.models.StarboardConfig
  || mongoose.model('StarboardConfig', starboardConfigSchema);

module.exports = { StarboardConfig };

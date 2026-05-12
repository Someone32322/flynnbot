const mongoose = require('mongoose');

const commandAnalyticsSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  command: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: false });

commandAnalyticsSchema.index({ guildId: 1, command: 1, timestamp: -1 });
commandAnalyticsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 86400 });

const CommandAnalytics = mongoose.models.CommandAnalytics
  || mongoose.model('CommandAnalytics', commandAnalyticsSchema);

module.exports = { CommandAnalytics };

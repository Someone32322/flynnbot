const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  type: {
    type: String,
    enum: ['join', 'leave', 'message', 'command', 'ban', 'kick', 'mute', 'warn', 'unban'],
    required: true,
  },
  userId: { type: String, default: null },
  channelId: { type: String, default: null },
  extra: { type: String, default: null }, // command name, etc.
  timestamp: { type: Date, default: Date.now },
}, { timestamps: false });

analyticsEventSchema.index({ guildId: 1, timestamp: -1 });
analyticsEventSchema.index({ guildId: 1, type: 1, timestamp: -1 });

// Auto-delete events older than 90 days
analyticsEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 86400 });

const AnalyticsEvent = mongoose.models.AnalyticsEvent
  || mongoose.model('AnalyticsEvent', analyticsEventSchema);

module.exports = { AnalyticsEvent };

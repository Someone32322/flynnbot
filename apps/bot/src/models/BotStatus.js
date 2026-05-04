const mongoose = require('mongoose');

const botStatusSchema = new mongoose.Schema({
  _id: { type: String, default: 'bot' },
  status: {
    type: String,
    enum: ['online', 'degraded', 'offline'],
    default: 'offline',
  },
  latencyMs: { type: Number, default: null },
  memoryMB: { type: Number, default: null },
  uptimeSeconds: { type: Number, default: null },
  guildCount: { type: Number, default: null },
  statusMessage: { type: String, default: 'Bot is initializing.' },
  lastHeartbeat: { type: Date, default: null },
  highLatency: { type: Boolean, default: false },
}, {
  timestamps: true,
  _id: false,
  versionKey: false,
});

const BotStatus = mongoose.model('BotStatus', botStatusSchema);
module.exports = { BotStatus };

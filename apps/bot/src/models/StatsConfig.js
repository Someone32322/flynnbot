const mongoose = require('mongoose');

const statChannelSchema = new mongoose.Schema({
  channelId: { type: String, required: true },
  type: {
    type: String,
    enum: ['members', 'online', 'bots', 'boosts', 'channels', 'roles', 'custom'],
    required: true,
  },
  template: { type: String, default: '{count}' }, // e.g. "Members: {count}"
  lastValue: { type: String, default: '' },
}, { _id: false });

const statsConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  channels: { type: [statChannelSchema], default: [] },
  updateInterval: { type: Number, default: 10 }, // minutes
}, { timestamps: true });

const StatsConfig = mongoose.models.StatsConfig
  || mongoose.model('StatsConfig', statsConfigSchema);

module.exports = { StatsConfig };

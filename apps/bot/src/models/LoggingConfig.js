const mongoose = require('mongoose');

const loggingConfigSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    // Map of eventKey → channelId. Keys are like 'channel_create', 'member_join', etc.
    channels: { type: Object, default: {} },
  },
  { timestamps: true }
);

const LoggingConfig =
  mongoose.models.LoggingConfig || mongoose.model('LoggingConfig', loggingConfigSchema);

module.exports = { LoggingConfig };

const mongoose = require('mongoose');

const slowmodeConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  rules: [{
    channelId: { type: String, required: true },
    threshold: { type: Number, default: 10 }, // messages per minute
    slowmodeSeconds: { type: Number, default: 5 },
    cooldownMinutes: { type: Number, default: 5 }, // time before removing slowmode
    _id: false,
  }],
}, { timestamps: true });

const SlowmodeConfig = mongoose.models.SlowmodeConfig
  || mongoose.model('SlowmodeConfig', slowmodeConfigSchema);

module.exports = { SlowmodeConfig };

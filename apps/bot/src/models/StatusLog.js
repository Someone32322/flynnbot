const mongoose = require('mongoose');

const statusLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  service: { type: String, enum: ['bot', 'dashboard'], required: true },
  type: {
    type: String,
    enum: ['online', 'offline', 'degraded', 'error', 'restart', 'maintenance', 'metric', 'startup'],
    required: true
  },
  message: { type: String, default: '' },
  // Can contain specific values like latencyMs, memoryMB, uptimeSeconds, cpuUsage for metric logs
  // Or error stack traces
  details: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
  timestamps: true
});

// Auto-delete records after 90 days (prevent uncontrolled DB growth)
statusLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = { StatusLog: mongoose.model('StatusLog', statusLogSchema) };

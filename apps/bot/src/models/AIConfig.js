const mongoose = require('mongoose');

const aiConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  allowedChannels: { type: [String], default: [] },
  systemPrompt: {
    type: String,
    default: 'You are a helpful Discord bot assistant. Be concise, friendly, and accurate.',
    maxlength: 2000,
  },
  model: {
    type: String,
    default: 'llama3-8b-8192',
    enum: ['llama3-8b-8192', 'llama3-70b-8192', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  },
  temperature: { type: Number, default: 0.7, min: 0, max: 2 },
  maxTokens: { type: Number, default: 512, min: 50, max: 2048 },
  requireMention: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.models.AIConfig || mongoose.model('AIConfig', aiConfigSchema);

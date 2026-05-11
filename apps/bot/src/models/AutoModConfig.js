const mongoose = require('mongoose');

const autoModConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  alertChannelId: { type: String, default: null },
  exemptRoles: { type: [String], default: [] },
  exemptChannels: { type: [String], default: [] },

  discordRules: {
    keyword: {
      enabled: { type: Boolean, default: false },
      keywords: { type: [String], default: [] },
      regex: { type: [String], default: [] },
      action: { type: String, enum: ['block', 'block_alert', 'block_timeout'], default: 'block' },
      timeoutSeconds: { type: Number, default: 60 },
      discordRuleId: { type: String, default: null },
    },
    mentionSpam: {
      enabled: { type: Boolean, default: false },
      mentionLimit: { type: Number, default: 5 },
      action: { type: String, enum: ['block', 'block_alert', 'block_timeout'], default: 'block' },
      timeoutSeconds: { type: Number, default: 60 },
      discordRuleId: { type: String, default: null },
    },
    spam: {
      enabled: { type: Boolean, default: false },
      action: { type: String, enum: ['block', 'block_alert', 'block_timeout'], default: 'block' },
      timeoutSeconds: { type: Number, default: 60 },
      discordRuleId: { type: String, default: null },
    },
    profanity: {
      enabled: { type: Boolean, default: false },
      presets: {
        type: [String],
        enum: ['PROFANITY', 'SEXUAL_CONTENT', 'SLURS'],
        default: ['PROFANITY'],
      },
      allowList: { type: [String], default: [] },
      action: { type: String, enum: ['block', 'block_alert', 'block_timeout'], default: 'block' },
      timeoutSeconds: { type: Number, default: 60 },
      discordRuleId: { type: String, default: null },
    },
  },

  botRules: {
    capsFilter: {
      enabled: { type: Boolean, default: false },
      minLength: { type: Number, default: 10 },
      threshold: { type: Number, default: 70 },
      action: { type: String, enum: ['delete', 'warn', 'mute'], default: 'delete' },
    },
    duplicateMessages: {
      enabled: { type: Boolean, default: false },
      count: { type: Number, default: 5 },
      intervalSeconds: { type: Number, default: 10 },
      action: { type: String, enum: ['delete', 'warn', 'mute'], default: 'delete' },
    },
    massEmoji: {
      enabled: { type: Boolean, default: false },
      limit: { type: Number, default: 10 },
      action: { type: String, enum: ['delete', 'warn', 'mute'], default: 'delete' },
    },
    zalgo: {
      enabled: { type: Boolean, default: false },
      action: { type: String, enum: ['delete', 'warn', 'mute'], default: 'delete' },
    },
    inviteLinks: {
      enabled: { type: Boolean, default: false },
      allowOwnServer: { type: Boolean, default: true },
      action: { type: String, enum: ['delete', 'warn', 'mute'], default: 'delete' },
    },
    phishing: {
      enabled: { type: Boolean, default: false },
      action: { type: String, enum: ['delete', 'warn', 'kick', 'ban'], default: 'ban' },
    },
  },

  syncNeeded: { type: Boolean, default: false },
}, { timestamps: true });

const AutoModConfig = mongoose.models.AutoModConfig
  || mongoose.model('AutoModConfig', autoModConfigSchema);

module.exports = { AutoModConfig };

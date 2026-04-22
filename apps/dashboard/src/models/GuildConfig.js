/**
 * Dashboard-side GuildConfig model.
 * Mirrors apps/bot/src/models/GuildConfig.js — must be kept in sync.
 */
const mongoose = require('mongoose');

const commandSettingSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    ephemeralMode: { type: String, enum: ['default', 'all', 'off'], default: 'default' },
    customDescription: { type: String, default: '' },
    allowedRoles: { type: [String], default: [] },
    allowedChannels: { type: [String], default: [] },
    prefixEnabled: { type: Boolean, default: true },
    discordCommandId: { type: String, default: null },
  },
  { _id: false }
);

const guildConfigSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    prefixEnabled: { type: Boolean, default: false },
    prefixes: { type: [String], default: [] },
    commandSettings: { type: Map, of: commandSettingSchema, default: {} },
    features: {
      tickets: { type: Boolean, default: true },
      automod: { type: Boolean, default: true },
      moderation: { type: Boolean, default: true },
    },
    moderation: {
      moderatorRoleId: { type: String, default: null },
      auditLogChannelId: { type: String, default: null },
    },
  },
  { timestamps: true, minimize: false }
);

const GuildConfig =
  mongoose.models.GuildConfig || mongoose.model('GuildConfig', guildConfigSchema);

module.exports = { GuildConfig };

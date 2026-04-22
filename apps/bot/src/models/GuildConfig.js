const mongoose = require("mongoose");

const commandSettingSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    // 'default' = bot decides, 'all' = force ephemeral, 'off' = force public
    ephemeralMode: {
      type: String,
      enum: ['default', 'all', 'off'],
      default: 'default',
    },
    customDescription: { type: String, default: '' },
    // empty = everyone allowed; otherwise array of role IDs
    allowedRoles: { type: [String], default: [] },
    // empty = all channels; otherwise array of channel IDs
    allowedChannels: { type: [String], default: [] },
    prefixEnabled: { type: Boolean, default: true },
    discordCommandId: { type: String, default: null },
  },
  { _id: false }
);

const guildConfigSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Prefix settings
    prefixEnabled: { type: Boolean, default: false },
    prefixes: {
      type: [String],
      default: [],
      validate: {
        validator: (v) => v.length <= 5,
        message: 'A maximum of 5 prefixes are allowed.',
      },
    },
    // Per-command settings keyed by command name
    commandSettings: {
      type: Map,
      of: commandSettingSchema,
      default: {},
    },
    features: {
      tickets: { type: Boolean, default: true },
      automod: { type: Boolean, default: true },
      moderation: { type: Boolean, default: true },
    },
    ticketSettings: {
      panelChannelId: { type: String, default: null },
      supportRoleId: { type: String, default: null },
    },
    automodSettings: {
      blockedWords: { type: [String], default: [] },
      maxMentions: { type: Number, default: 5 },
    },
    moderation: {
      moderatorRoleId: { type: String, default: null },
      auditLogChannelId: { type: String, default: null },
    },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

const GuildConfig = mongoose.models.GuildConfig || mongoose.model("GuildConfig", guildConfigSchema);

module.exports = {
  GuildConfig,
};

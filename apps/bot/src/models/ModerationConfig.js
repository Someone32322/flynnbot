const mongoose = require('mongoose');

/**
 * Bot-side ModerationConfig model.
 * Uses the same MongoDB collection as the dashboard's ModerationConfig model
 * so both services share the same data.
 * This schema only declares fields the bot needs to READ.
 */
const moderationConfigSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },

    purgePinned: { type: Boolean, default: false },

    userNotifications: {
      enabled:           { type: Boolean, default: true  },
      onPunish:          { type: Boolean, default: true  },
      onUnpunish:        { type: Boolean, default: true  },
      onPunishByOther:   { type: Boolean, default: false },
      onUnpunishByOther: { type: Boolean, default: false },
      sendAttachments:   { type: Boolean, default: false },
    },

    immuneRoles: {
      useHierarchy: { type: Boolean,   default: false },
      global:       { type: [String],  default: []    },
      ban:          { type: [String],  default: []    },
      kick:         { type: [String],  default: []    },
      mute:         { type: [String],  default: []    },
      warn:         { type: [String],  default: []    },
    },

    punishSettings: {
      ban:  { defaultReason: String, defaultDuration: String, forceReason: Boolean },
      kick: { defaultReason: String, defaultDuration: String, forceReason: Boolean },
      mute: { defaultReason: String, defaultDuration: String, forceReason: Boolean },
      warn: { defaultReason: String, defaultDuration: String, forceReason: Boolean },
    },
  },
  { timestamps: true, minimize: false }
);

const ModerationConfig =
  mongoose.models.ModerationConfig ||
  mongoose.model('ModerationConfig', moderationConfigSchema);

module.exports = { ModerationConfig };

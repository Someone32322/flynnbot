const mongoose = require("mongoose");

const levelRewardSchema = new mongoose.Schema(
  {
    level: { type: Number, required: true, min: 0 },
    roleId: { type: String, required: true },
  },
  { _id: false }
);

const levelConfigSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: true },
    xpRate: { type: Number, default: 15, min: 1, max: 500 },
    xpCooldown: { type: Number, default: 60, min: 0, max: 3600 },
    xpChannels: { type: [String], default: [] },
    rewards: { type: [levelRewardSchema], default: [] },
    levelUpMessage: {
      type: String,
      default: "Congrats {user}! You reached level {level} in {server}.",
    },
    levelUpChannelId: { type: String, default: null },
    roleStack: { type: Boolean, default: true },
    formula: {
      a: { type: Number, default: 5 },
      b: { type: Number, default: 50 },
      c: { type: Number, default: 100 },
    },
  },
  { timestamps: true }
);

const LevelConfig =
  mongoose.models.LevelConfig || mongoose.model("LevelConfig", levelConfigSchema);

module.exports = { LevelConfig };

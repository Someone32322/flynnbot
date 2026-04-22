const mongoose = require("mongoose");

const moderationCounterSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    nextCaseNumber: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

const ModerationCounter =
  mongoose.models.ModerationCounter ||
  mongoose.model("ModerationCounter", moderationCounterSchema);

module.exports = {
  ModerationCounter,
};

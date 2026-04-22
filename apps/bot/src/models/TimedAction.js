const mongoose = require("mongoose");

const timedActionSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: "ModerationCase", required: true, index: true },
    caseNumber: { type: String, required: true },
    actionType: { type: String, required: true, index: true },
    targetUserId: { type: String, default: null },
    roleId: { type: String, default: null },
    channelId: { type: String, default: null },
    channelIds: { type: [String], default: [] },
    executeAt: { type: Date, required: true, index: true },
    active: { type: Boolean, default: true, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

const TimedAction = mongoose.models.TimedAction || mongoose.model("TimedAction", timedActionSchema);

module.exports = {
  TimedAction,
};

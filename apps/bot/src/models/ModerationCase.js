const mongoose = require("mongoose");

const moderationCaseSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    caseNumber: { type: String, required: true },
    type: { type: String, required: true, index: true },
    targetUserId: { type: String, required: true, index: true },
    targetTag: { type: String, default: null },
    moderatorId: { type: String, required: true, index: true },
    moderatorTag: { type: String, default: null },
    reason: { type: String, default: "No reason provided." },
    active: { type: Boolean, default: false, index: true },
    durationMs: { type: Number, default: null },
    expiresAt: { type: Date, default: null, index: true },
    endedAt: { type: Date, default: null },
    removedAt: { type: Date, default: null },
    removedReason: { type: String, default: null },
    dmDelivered: { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

moderationCaseSchema.index({ guildId: 1, caseNumber: 1 }, { unique: true });

const ModerationCase =
  mongoose.models.ModerationCase ||
  mongoose.model("ModerationCase", moderationCaseSchema);

module.exports = {
  ModerationCase,
};

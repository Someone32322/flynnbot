const { Schema, model } = require("mongoose");

const moderationSchema = new Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: false },
    moderatorId: { type: String, required: true },
    action: { type: String, required: true }, // "warn", "kick", "ban", etc.
    reason: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    extra: { type: String, default: "" }
});

module.exports = model("Moderation", moderationSchema);
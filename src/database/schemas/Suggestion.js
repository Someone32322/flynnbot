const { Schema, model } = require("mongoose");

const suggestionSchema = new Schema({
    suggestionId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
    authorId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'implemented'], default: 'pending' },
    upvotes: [{ type: String }], // Array of user IDs who upvoted
    downvotes: [{ type: String }], // Array of user IDs who downvoted
    approvedBy: { type: String, default: null },
    rejectedBy: { type: String, default: null },
    implementedBy: { type: String, default: null },
    reason: { type: String, default: '' }, // Reason for approval/rejection
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = model("Suggestion", suggestionSchema);
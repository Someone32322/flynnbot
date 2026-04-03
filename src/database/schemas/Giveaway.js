const { Schema, model } = require("mongoose");

const giveawaySchema = new Schema({
    messageId: { type: String, required: true, unique: true },
    channelId: { type: String, required: true },
    guildId: { type: String, required: true },
    hostId: { type: String, required: true },
    prize: { type: String, required: true },
    winnerCount: { type: Number, default: 1 },
    participants: [{ type: String }], // Array of user IDs
    endTime: { type: Date, required: true },
    ended: { type: Boolean, default: false },
    winners: [{ type: String }], // Array of winner user IDs
    createdAt: { type: Date, default: Date.now }
});

module.exports = model("Giveaway", giveawaySchema);
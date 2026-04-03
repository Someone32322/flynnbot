const { Schema, model } = require("mongoose");

const ticketSchema = new Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    userId: { type: String, required: true },
    ticketId: { type: String, required: true }, // e.g., ticket-001
    status: { type: String, default: "open" }, // open, closed
    claimedBy: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null }
});

module.exports = model("Ticket", ticketSchema);
const { Schema, model } = require("mongoose");

const userSchema = new Schema({
    userId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    balance: { type: Number, default: 0 },
    bank: { type: Number, default: 0 },
    inventory: { type: Map, of: Number, default: {} }, // item name to quantity
    lastDaily: { type: Date, default: null },
    lastWork: { type: Date, default: null },
    lastBeg: { type: Date, default: null },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 }
});

module.exports = model("User", userSchema);
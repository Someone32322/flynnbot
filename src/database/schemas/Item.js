const { Schema, model } = require("mongoose");

const itemSchema = new Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    sellPrice: { type: Number, default: 0 },
    emoji: { type: String, default: "" },
    type: { type: String, default: "item" }, // item, tool, etc.
    guildId: { type: String, required: true } // per guild
});

module.exports = model("Item", itemSchema);
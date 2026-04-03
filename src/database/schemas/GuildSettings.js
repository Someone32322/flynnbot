const { Schema, model } = require("mongoose");

const guildSettingsSchema = new Schema({
    guildId: { type: String, required: true, unique: true },
    modLogChannelId: { type: String, default: null },
    modRoleId: { type: String, default: null },
    ticketChannelId: { type: String, default: null },
    supportRoleId: { type: String, default: null },
    transcriptChannelId: { type: String, default: null },
    suggestionChannelId: { type: String, default: null }
});

module.exports = model("GuildSettings", guildSettingsSchema);
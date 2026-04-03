const { Schema, model } = require("mongoose");

const profileSchema = new Schema({
    userId: { type: String, required: true, unique: true },
    bio: { type: String, default: "", maxlength: 500 },
    favoriteColor: { type: String, default: "#0099ff" },
    favoriteGame: { type: String, default: "" },
    favoriteMusic: { type: String, default: "" },
    hobbies: [{ type: String }],
    socialLinks: {
        twitter: { type: String, default: "" },
        instagram: { type: String, default: "" },
        youtube: { type: String, default: "" },
        twitch: { type: String, default: "" },
        discord: { type: String, default: "" }
    },
    badges: [{ type: String }],
    reputation: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = model("Profile", profileSchema);
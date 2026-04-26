const mongoose = require("mongoose");

const healthStatusSchema = new mongoose.Schema(
  {
    // This is a singleton doc for the official Flynn support server
    // guildId is fixed to the support server, messageId tracks the status embed
    guildId: { type: String, required: true, unique: true, index: true },
    channelId: { type: String, required: true },
    
    // Current status
    botStatus: { type: String, enum: ["online", "offline"], default: "online" },
    websiteStatus: { type: String, enum: ["online", "offline"], default: "online" },
    
    // Last status message
    messageId: { type: String, default: null },
    
    // Last status change times for debugging
    lastBotStatusChange: { type: Date, default: null },
    lastWebsiteStatusChange: { type: Date, default: null },
    lastChecked: { type: Date, default: null },
    
    // Health check history (keep last 10 checks)
    recentChecks: [
      {
        timestamp: Date,
        botOnline: Boolean,
        websiteOnline: Boolean,
      },
    ],
  },
  { timestamps: true }
);

// Keep only last 10 checks
healthStatusSchema.pre("save", function (next) {
  if (this.recentChecks.length > 10) {
    this.recentChecks = this.recentChecks.slice(-10);
  }
  next();
});

const HealthStatus =
  mongoose.models.HealthStatus || mongoose.model("HealthStatus", healthStatusSchema);

module.exports = { HealthStatus };

const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, default: 1, min: 0 },
    type: { type: String, default: 'item' },
    emoji: { type: String, default: '📦' },
  },
  { _id: false }
);

const economyProfileSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    wallet: { type: Number, default: 0, min: 0 },
    bank: { type: Number, default: 0, min: 0 },
    bankCap: { type: Number, default: 50000 },
    netWorth: { type: Number, default: 0 },
    inventory: { type: [inventoryItemSchema], default: [] },
    // Cooldowns (timestamps)
    lastDaily: { type: Date, default: null },
    lastWeekly: { type: Date, default: null },
    lastWork: { type: Date, default: null },
    lastCrime: { type: Date, default: null },
    lastBeg: { type: Date, default: null },
    lastFish: { type: Date, default: null },
    lastHunt: { type: Date, default: null },
    lastRob: { type: Date, default: null },
    // Stats
    totalEarned: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    totalGambled: { type: Number, default: 0 },
    totalWon: { type: Number, default: 0 },
    totalLost: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    lastStreakDate: { type: Date, default: null },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

economyProfileSchema.index({ guildId: 1, userId: 1 }, { unique: true });
economyProfileSchema.index({ guildId: 1, wallet: -1 });

const EconomyProfile =
  mongoose.models.EconomyProfile || mongoose.model('EconomyProfile', economyProfileSchema);

module.exports = { EconomyProfile };

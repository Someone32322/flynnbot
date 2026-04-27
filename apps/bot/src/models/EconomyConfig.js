const mongoose = require('mongoose');

const shopItemSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    emoji: { type: String, default: '📦' },
    type: { type: String, default: 'item' }, // item, role, consumable
    roleId: { type: String, default: null }, // if type is 'role'
    usable: { type: Boolean, default: false },
    useEffect: { type: String, default: null }, // 'wallet_boost', 'xp_boost', etc.
    useValue: { type: Number, default: 0 },
    stock: { type: Number, default: -1 }, // -1 = unlimited
    soldCount: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

const economyConfigSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: true },
    // Currency branding
    currencyName: { type: String, default: 'Flynn Coins' },
    currencySymbol: { type: String, default: '💎' },
    // Starting balance given on first interaction
    startingBalance: { type: Number, default: 500 },
    // Daily/weekly rewards
    dailyAmount: { type: Number, default: 250 },
    weeklyAmount: { type: Number, default: 1500 },
    dailyCooldownHours: { type: Number, default: 22 },
    weeklyCooldownDays: { type: Number, default: 7 },
    // Work
    workCooldownMinutes: { type: Number, default: 60 },
    workMin: { type: Number, default: 100 },
    workMax: { type: Number, default: 400 },
    // Crime
    crimeCooldownMinutes: { type: Number, default: 90 },
    crimeMin: { type: Number, default: 200 },
    crimeMax: { type: Number, default: 800 },
    crimeSuccessRate: { type: Number, default: 60 }, // %
    crimeFineMin: { type: Number, default: 100 },
    crimeFineMax: { type: Number, default: 400 },
    // Beg
    begCooldownMinutes: { type: Number, default: 30 },
    begMin: { type: Number, default: 10 },
    begMax: { type: Number, default: 75 },
    // Rob
    robCooldownMinutes: { type: Number, default: 300 },
    robSuccessRate: { type: Number, default: 40 }, // %
    robMin: { type: Number, default: 5 }, // % of target wallet
    robMax: { type: Number, default: 20 }, // % of target wallet
    // Fish
    fishCooldownMinutes: { type: Number, default: 20 },
    // Hunt
    huntCooldownMinutes: { type: Number, default: 25 },
    // Gambling limits
    maxBet: { type: Number, default: 50000 },
    minBet: { type: Number, default: 10 },
    // Bank
    defaultBankCap: { type: Number, default: 50000 },
    // Shop
    shop: { type: [shopItemSchema], default: [] },
    // Channels (whitelist — empty = all channels)
    allowedChannels: { type: [String], default: [] },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

const EconomyConfig =
  mongoose.models.EconomyConfig || mongoose.model('EconomyConfig', economyConfigSchema);

module.exports = { EconomyConfig };

const mongoose = require('mongoose');

const giveawaySchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, default: null },
  prize: { type: String, required: true },
  winnerCount: { type: Number, default: 1, min: 1 },
  hostedBy: { type: String, required: true },
  endsAt: { type: Date, required: true },
  endedAt: { type: Date, default: null },
  status: { type: String, enum: ['active', 'ended', 'cancelled'], default: 'active' },
  winners: { type: [String], default: [] },
  entries: { type: [String], default: [] },
  requiredRoles: { type: [String], default: [] },
  bonusEntries: [{
    roleId: { type: String },
    bonus: { type: Number, default: 1 },
  }],
  description: { type: String, default: '' },
}, { timestamps: true });

giveawaySchema.index({ guildId: 1, status: 1, endsAt: 1 });

const Giveaway = mongoose.models.Giveaway
  || mongoose.model('Giveaway', giveawaySchema);

module.exports = { Giveaway };

const mongoose = require('mongoose');

const inviteTrackerSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  inviteCode: { type: String, required: true },
  inviterId: { type: String, required: true },
  uses: { type: Number, default: 0 },
  maxUses: { type: Number, default: 0 },
  expiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: null },
}, { timestamps: true });

inviteTrackerSchema.index({ guildId: 1 });
inviteTrackerSchema.index({ guildId: 1, inviteCode: 1 }, { unique: true });

const InviteTracker = mongoose.models.InviteTracker
  || mongoose.model('InviteTracker', inviteTrackerSchema);

const inviteJoinSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  inviteCode: { type: String, default: null },
  inviterId: { type: String, default: null },
  joinedAt: { type: Date, default: Date.now },
}, { timestamps: true });

inviteJoinSchema.index({ guildId: 1, userId: 1 });

const InviteJoin = mongoose.models.InviteJoin
  || mongoose.model('InviteJoin', inviteJoinSchema);

module.exports = { InviteTracker, InviteJoin };

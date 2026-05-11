const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  ticketId: { type: String, required: true, unique: true },
  guildId: { type: String, required: true, index: true },
  channelId: { type: String, required: true },
  userId: { type: String, required: true },
  panelId: { type: String, default: null },
  category: { type: String, default: 'General' },
  status: { type: String, enum: ['open', 'closed', 'archived'], default: 'open', index: true },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'low' },
  claimedBy: { type: String, default: null },
  closedBy: { type: String, default: null },
  closeReason: { type: String, default: '' },
  tags: { type: [String], default: [] },
  lastActivity: { type: Date, default: Date.now },
  openedAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null },
}, { timestamps: true });

ticketSchema.index({ guildId: 1, userId: 1, status: 1 });

const Ticket = mongoose.models.Ticket
  || mongoose.model('Ticket', ticketSchema);

module.exports = { Ticket };

const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const ticketButtonSchema = new mongoose.Schema({
  label: { type: String, default: 'Open Ticket' },
  emoji: { type: String, default: '🎫' },
  style: { type: String, enum: ['primary', 'secondary', 'success', 'danger'], default: 'primary' },
  category: { type: String, default: 'General' },
}, { _id: false });

const ticketPanelSchema = new mongoose.Schema({
  panelId: { type: String, default: () => randomUUID().split('-')[0] },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  channelId: { type: String, required: true },
  messageId: { type: String, default: null },
  categoryId: { type: String, default: null },
  supportRoles: { type: [String], default: [] },
  ticketNameFormat: { type: String, default: 'ticket-{username}' },
  welcomeMessage: {
    type: String,
    default: 'Thanks for opening a ticket! A member of our support team will be with you shortly.',
  },
  closeMessage: { type: String, default: 'This ticket has been closed.' },
  autoCloseHours: { type: Number, default: 0 },
  maxOpenPerUser: { type: Number, default: 1 },
  transcripts: {
    enabled: { type: Boolean, default: false },
    channelId: { type: String, default: null },
  },
  buttons: { type: [ticketButtonSchema], default: () => [{}] },
}, { _id: false });

const ticketConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  panels: { type: [ticketPanelSchema], default: [] },
  logChannelId: { type: String, default: null },
}, { timestamps: true });

const TicketConfig = mongoose.models.TicketConfig
  || mongoose.model('TicketConfig', ticketConfigSchema);

module.exports = { TicketConfig };

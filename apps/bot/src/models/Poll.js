const mongoose = require('mongoose');

const pollOptionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
  votes: { type: [String], default: [] }, // array of userIds
}, { _id: false });

const pollSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, default: null },
  question: { type: String, required: true },
  type: { type: String, enum: ['yesno', 'choice'], default: 'choice' },
  options: { type: [pollOptionSchema], default: [] },
  createdBy: { type: String, required: true },
  endsAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  anonymous: { type: Boolean, default: false },
}, { timestamps: true });

pollSchema.index({ guildId: 1, status: 1 });

const Poll = mongoose.models.Poll || mongoose.model('Poll', pollSchema);

module.exports = { Poll };

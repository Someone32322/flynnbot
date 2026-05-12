const mongoose = require('mongoose');

const afkSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  reason: { type: String, default: 'AFK' },
  setAt: { type: Date, default: Date.now },
}, { timestamps: true });

afkSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const AFKEntry = mongoose.models.AFKEntry
  || mongoose.model('AFKEntry', afkSchema);

module.exports = { AFKEntry };

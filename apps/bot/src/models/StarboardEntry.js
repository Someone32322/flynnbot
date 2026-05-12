const mongoose = require('mongoose');

const starboardEntrySchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  sourceMessageId: { type: String, required: true },
  sourceChannelId: { type: String, required: true },
  starboardMessageId: { type: String, default: null },
  authorId: { type: String, required: true },
  starCount: { type: Number, default: 0 },
  content: { type: String, default: '' },
  imageUrl: { type: String, default: null },
}, { timestamps: true });

starboardEntrySchema.index({ guildId: 1, sourceMessageId: 1 }, { unique: true });

const StarboardEntry = mongoose.models.StarboardEntry
  || mongoose.model('StarboardEntry', starboardEntrySchema);

module.exports = { StarboardEntry };

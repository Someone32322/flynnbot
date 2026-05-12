const mongoose = require('mongoose');

const userNoteSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  targetUserId: { type: String, required: true },
  targetTag: { type: String, default: '' },
  content: { type: String, required: true, maxlength: 2000 },
  addedBy: { type: String, required: true },
  addedByTag: { type: String, default: '' },
  caseId: { type: String, default: null },
}, { timestamps: true });

userNoteSchema.index({ guildId: 1, targetUserId: 1 });

const UserNote = mongoose.models.UserNote
  || mongoose.model('UserNote', userNoteSchema);

module.exports = { UserNote };

const mongoose = require('mongoose');

const archivedMessageSchema = new mongoose.Schema(
  {
    authorId:   { type: String },
    authorTag:  { type: String },
    content:    { type: String, default: '' },
    timestamp:  { type: Date },
    attachments: { type: [String], default: [] },
    embedCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const messageArchiveSchema = new mongoose.Schema(
  {
    guildId:      { type: String, required: true, index: true },
    archiveId:    { type: String, required: true, unique: true },
    targetType:   { type: String, enum: ['user', 'channel'], required: true },
    targetId:     { type: String, required: true },
    targetName:   { type: String, default: null },
    createdById:  { type: String, required: true },
    createdByTag: { type: String, default: null },
    messageCount: { type: Number, default: 0 },
    messages:     { type: [archivedMessageSchema], default: [] },
  },
  { timestamps: true }
);

const MessageArchive =
  mongoose.models.MessageArchive || mongoose.model('MessageArchive', messageArchiveSchema);

module.exports = { MessageArchive };

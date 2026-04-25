const mongoose = require('mongoose');

const rrOptionSchema = new mongoose.Schema(
  {
    optId:       { type: String, required: true },
    label:       { type: String, required: true },
    emoji:       { type: String, default: null },
    description: { type: String, default: null },
    style:       { type: String, enum: ['primary', 'secondary', 'success', 'danger'], default: 'primary' },
    action:      { type: String, enum: ['role', 'message', 'dm'], required: true },
    contentType: { type: String, enum: ['message', 'embed'], default: 'message' },
    roleId:      { type: String, default: null },
    toggleRole:  { type: Boolean, default: true },
    content:     { type: String, default: null },
    embedTitle:       { type: String, default: null },
    embedDescription: { type: String, default: null },
    embedColor:       { type: Number, default: 0x0f52ba },
    embedFooter:      { type: String, default: null },
    embedImageUrl:    { type: String, default: null },
    embedThumbnailUrl:{ type: String, default: null },
  },
  { _id: false }
);

const reactionRoleSchema = new mongoose.Schema(
  {
    guildId:           { type: String, required: true, index: true },
    name:              { type: String, required: true },
    type:              { type: String, enum: ['button', 'dropdown', 'emoji'], required: true },
    channelId:         { type: String, default: null },
    messageId:         { type: String, default: null },
    externalChannelId: { type: String, default: null },
    externalMessageId: { type: String, default: null },
    messageUrl:        { type: String, default: null },
    embedTitle:        { type: String, default: 'Reaction Roles' },
    embedDescription:  { type: String, default: 'Click a button or select an option below.' },
    embedColor:        { type: Number, default: 0x0f52ba },
    options:           { type: [rrOptionSchema], default: [] },
  },
  { timestamps: true }
);

reactionRoleSchema.index({ guildId: 1, name: 1 }, { unique: true });

const ReactionRole =
  mongoose.models.ReactionRole || mongoose.model('ReactionRole', reactionRoleSchema);

module.exports = { ReactionRole };

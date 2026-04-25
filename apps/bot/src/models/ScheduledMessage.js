/**
 * Bot-side ScheduledMessage model — mirrors apps/dashboard/src/models/ScheduledMessage.js
 */
const mongoose = require('mongoose');

const embedFieldSchema = new mongoose.Schema(
  { name: { type: String, default: '' }, value: { type: String, default: '' }, inline: { type: Boolean, default: false } },
  { _id: false }
);

const embedSchema = new mongoose.Schema(
  {
    title:       { type: String, default: null },
    description: { type: String, default: null },
    url:         { type: String, default: null },
    color:       { type: Number, default: 0x0f52ba },
    authorName:  { type: String, default: null },
    authorIcon:  { type: String, default: null },
    authorUrl:   { type: String, default: null },
    footerText:  { type: String, default: null },
    footerIcon:  { type: String, default: null },
    imageUrl:    { type: String, default: null },
    thumbnail:   { type: String, default: null },
    timestamp:   { type: Boolean, default: false },
    fields:      { type: [embedFieldSchema], default: [] },
  },
  { _id: false }
);

// ── Action Row schemas ─────────────────────────────────────────
const arOptionSchema = new mongoose.Schema(
  {
    optId:       { type: String, default: () => Math.random().toString(36).slice(2, 10).toUpperCase() },
    label:       { type: String, default: '' },
    emoji:       { type: String, default: null },
    description: { type: String, default: null },
    style:       { type: String, enum: ['primary', 'secondary', 'success', 'danger', 'link'], default: 'primary' },
    url:         { type: String, default: null },
    action:      { type: String, enum: ['role', 'message', 'dm'], default: 'role' },
    roleId:      { type: String, default: null },
    toggleRole:  { type: Boolean, default: true },
    content:     { type: String, default: null },
    contentType: { type: String, enum: ['message', 'embed'], default: 'message' },
  },
  { _id: false }
);

const actionRowSchema = new mongoose.Schema(
  {
    rowId:       { type: String, default: () => Math.random().toString(36).slice(2, 10).toUpperCase() },
    rowType:     { type: String, enum: ['button', 'select', 'emoji'], default: 'button' },
    placeholder: { type: String, default: null },
    options:     { type: [arOptionSchema], default: [] },
  },
  { _id: false }
);

const deliverySchema = new mongoose.Schema(
  {
    type:                  { type: String, enum: ['template', 'channel', 'webhook', 'schedule_once', 'schedule_repeat', 'sticky', 'command'], default: 'template' },
    channelId:             { type: String, default: null },
    webhookUrl:            { type: String, default: null },
    scheduleAt:            { type: Date,   default: null },
    intervalMins:          { type: Number, default: null },
    nextRun:               { type: Date,   default: null },
    lastRun:               { type: Date,   default: null },
    scheduleEnabled:       { type: Boolean, default: true },
    commandTrigger:        { type: String, default: null },
    commandRequiredRoleId: { type: String, default: null },
  },
  { _id: false }
);

const scheduledMessageSchema = new mongoose.Schema(
  {
    guildId:         { type: String, required: true, index: true },
    name:            { type: String, required: true },
    content:         { type: String, default: null },
    embeds:          { type: [embedSchema], default: [] },
    actionRows:      { type: [actionRowSchema], default: [] },
    delivery:        { type: deliverySchema, default: () => ({ type: 'template' }) },
    postedMessageId: { type: String, default: null },
    postedChannelId: { type: String, default: null },
  },
  { timestamps: true }
);

scheduledMessageSchema.index({ guildId: 1, name: 1 }, { unique: true });

const ScheduledMessage =
  mongoose.models.ScheduledMessage || mongoose.model('ScheduledMessage', scheduledMessageSchema);

module.exports = { ScheduledMessage };

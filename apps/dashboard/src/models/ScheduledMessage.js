/**
 * ScheduledMessage — rich message builder model.
 * Supports: embed + content, multiple delivery modes, scheduling, sticky, webhook, command triggers.
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

const deliverySchema = new mongoose.Schema(
  {
    // template=saved only, channel=send to channel, webhook=discord webhook,
    // schedule_once=run at date, schedule_repeat=run every N mins,
    // sticky=repost on every new message, command=triggered by keyword
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

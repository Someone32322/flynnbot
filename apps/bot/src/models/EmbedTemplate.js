const mongoose = require('mongoose');

const embedFieldSchema = new mongoose.Schema(
  {
    name:   { type: String, required: true },
    value:  { type: String, required: true },
    inline: { type: Boolean, default: false },
  },
  { _id: false }
);

const embedTemplateSchema = new mongoose.Schema(
  {
    guildId:      { type: String, required: true, index: true },
    name:         { type: String, required: true },
    title:        { type: String, default: null },
    description:  { type: String, default: null },
    color:        { type: Number, default: 0x0f52ba },
    footer:       { type: String, default: null },
    imageUrl:     { type: String, default: null },
    thumbnailUrl: { type: String, default: null },
    author:       { type: String, default: null },
    fields:       { type: [embedFieldSchema], default: [] },
  },
  { timestamps: true }
);

embedTemplateSchema.index({ guildId: 1, name: 1 }, { unique: true });

const EmbedTemplate =
  mongoose.models.EmbedTemplate || mongoose.model('EmbedTemplate', embedTemplateSchema);

module.exports = { EmbedTemplate };

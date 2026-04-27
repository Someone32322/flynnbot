const mongoose = require('mongoose');

const themeConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  embedColor: { type: String, default: '#0f52ba' },
  embedFooterText: { type: String, default: '', maxlength: 200 },
  embedFooterIconUrl: { type: String, default: '' },
  embedAuthorName: { type: String, default: '', maxlength: 200 },
  embedAuthorIconUrl: { type: String, default: '' },
  thumbnailUrl: { type: String, default: '' },
  useServerIcon: { type: Boolean, default: false },
  showTimestamp: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.models.ThemeConfig || mongoose.model('ThemeConfig', themeConfigSchema);

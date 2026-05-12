const mongoose = require('mongoose');

const embedSubSchema = new mongoose.Schema({
  color: { type: String, default: '#5865f2' },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  footer: { type: String, default: '' },
  thumbnail: { type: Boolean, default: true },
}, { _id: false });

const welcomeConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },

  welcome: {
    enabled: { type: Boolean, default: false },
    channelId: { type: String, default: null },
    message: { type: String, default: 'Welcome {user} to **{server}**!' },
    embedEnabled: { type: Boolean, default: false },
    embed: { type: embedSubSchema, default: () => ({}) },
    dmEnabled: { type: Boolean, default: false },
    dmMessage: { type: String, default: 'Welcome to **{server}**! Please read the rules.' },
    autoRoles: { type: [String], default: [] },
    accountAgeCheck: {
      enabled: { type: Boolean, default: false },
      minDays: { type: Number, default: 7 },
      warnChannelId: { type: String, default: null },
    },
  },

  goodbye: {
    enabled: { type: Boolean, default: false },
    channelId: { type: String, default: null },
    message: { type: String, default: '**{tag}** has left the server.' },
    embedEnabled: { type: Boolean, default: false },
    embed: {
      type: new mongoose.Schema({
        color: { type: String, default: '#ef4444' },
        title: { type: String, default: '' },
        description: { type: String, default: '' },
        footer: { type: String, default: '' },
        thumbnail: { type: Boolean, default: true },
      }, { _id: false }),
      default: () => ({ color: '#ef4444' }),
    },
  },
  testSend: {
    pending: { type: Boolean, default: false },
    type: { type: String, enum: ['welcome', 'goodbye'], default: 'welcome' },
    channelId: { type: String, default: null },
  },
}, { timestamps: true });

const WelcomeConfig = mongoose.models.WelcomeConfig
  || mongoose.model('WelcomeConfig', welcomeConfigSchema);

module.exports = { WelcomeConfig };

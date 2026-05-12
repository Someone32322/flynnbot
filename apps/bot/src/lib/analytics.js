/**
 * Analytics tracker — fire-and-forget event logging.
 */
const { AnalyticsEvent } = require('../models/AnalyticsEvent');

const VALID_TYPES = new Set(['join', 'leave', 'message', 'command', 'ban', 'kick', 'mute', 'warn', 'unban']);

function trackEvent(guildId, type, userId = null, channelId = null, extra = null) {
  if (!VALID_TYPES.has(type)) return;
  AnalyticsEvent.create({ guildId, type, userId, channelId, extra }).catch(() => null);
}

module.exports = { trackEvent };

/**
 * slowmode.js — Auto-slowmode handler.
 * Tracks per-channel message rates and automatically applies Discord slowmode
 * when the configured threshold (messages per minute) is exceeded.
 * Removes slowmode after the configured cooldown period.
 */

const { SlowmodeConfig } = require('../models/SlowmodeConfig');

const configCache = new Map();
const CONFIG_TTL = 60_000;

// Per-channel message timestamps for rate tracking: channelId → number[]
const msgTimestamps = new Map();

// Channels currently under auto-slowmode: channelId → timeoutId
const activeSlowmode = new Map();

async function getConfig(guildId) {
  const cached = configCache.get(guildId);
  if (cached && Date.now() - cached.ts < CONFIG_TTL) return cached.cfg;
  const cfg = await SlowmodeConfig.findOne({ guildId }).lean().catch(() => null);
  configCache.set(guildId, { cfg, ts: Date.now() });
  return cfg;
}

function invalidateCache(guildId) {
  configCache.delete(guildId);
}

/**
 * Called from messageCreate. Checks if the channel has an auto-slowmode rule
 * and applies Discord rate limiting when the threshold is exceeded.
 *
 * @param {import('discord.js').Message} message
 */
async function handleAutoSlowmode(message) {
  if (!message.guild || message.author.bot) return;

  const config = await getConfig(message.guild.id);
  if (!config?.enabled || !config.rules?.length) return;

  const rule = config.rules.find((r) => r.channelId === message.channelId);
  if (!rule) return;

  const now = Date.now();
  const windowMs = 60_000; // 1 minute rolling window

  // Update timestamps for this channel (keep only last 1 minute)
  const timestamps = (msgTimestamps.get(message.channelId) || []).filter((ts) => now - ts < windowMs);
  timestamps.push(now);
  msgTimestamps.set(message.channelId, timestamps);

  const msgPerMinute = timestamps.length;

  // Only apply if not already under auto-slowmode and threshold exceeded
  if (msgPerMinute >= rule.threshold && !activeSlowmode.has(message.channelId)) {
    const channel = message.channel;
    if (!channel?.setRateLimitPerUser) return;

    await channel.setRateLimitPerUser(
      rule.slowmodeSeconds,
      `Auto-slowmode: ${msgPerMinute} msg/min (threshold: ${rule.threshold})`
    ).catch(() => null);

    console.info(
      `[AutoSlowmode] Applied ${rule.slowmodeSeconds}s slowmode to #${channel.name} ` +
      `in guild ${message.guild.id} (${msgPerMinute} msg/min)`
    );

    // Schedule removal after cooldown
    const timeoutId = setTimeout(async () => {
      const ch = message.client.channels.cache.get(message.channelId);
      if (ch?.setRateLimitPerUser) {
        await ch.setRateLimitPerUser(0, 'Auto-slowmode: cooldown expired').catch(() => null);
        console.info(`[AutoSlowmode] Removed slowmode from #${ch.name} in guild ${message.guild.id}`);
      }
      activeSlowmode.delete(message.channelId);
    }, rule.cooldownMinutes * 60_000);

    activeSlowmode.set(message.channelId, timeoutId);
  }
}

module.exports = { handleAutoSlowmode, invalidateCache };

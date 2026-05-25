/**
 * Bot Health Reporter
 * ─────────────────────────────────────────────────────────────
 * Runs on a 30-second interval. Measures latency, memory, and
 * uptime, then upserts a BotStatus document in MongoDB so the
 * dashboard status page can read it in real time.
 *
 * Also fires Discord webhook notifications when the bot:
 *   - Comes online
 *   - Experiences high latency (> HIGH_LATENCY_MS)
 *   - Recovers from high latency
 */

const { BotStatus } = require('../models/BotStatus');
const { StatusLog } = require('../models/StatusLog');
const { sendStatusWebhook } = require('./statusWebhook');

const INTERVAL_MS = 30_000;       // Report every 30 s
const HIGH_LATENCY_MS = 400;      // Threshold for "degraded"
const OFFLINE_TIMEOUT_MS = 90_000; // If heartbeat > 90 s ago, consider offline

let reporterInterval = null;
let wasHighLatency = false;
let hasAnnouncedOnline = false;

/**
 * Compute latency from Discord.js WebSocket ping.
 * Returns the ping in ms, or null if unavailable.
 */
function getLatency(client) {
  return client.ws?.ping ?? null;
}

/**
 * Persist the current health snapshot to MongoDB and optionally
 * fire a webhook notification.
 */
async function report(client) {
  try {
    const latencyMs = getLatency(client);
    const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const uptimeSec = Math.floor(process.uptime());
    const guildCount = client.guilds?.cache?.size ?? null;

    const isHighLatency = latencyMs !== null && latencyMs > HIGH_LATENCY_MS;
    const statusLevel = isHighLatency ? 'degraded' : 'online';

    const statusMessage = isHighLatency
      ? `Experiencing elevated latency (${latencyMs} ms). Investigating.`
      : `All systems operational.`;

    await BotStatus.findByIdAndUpdate(
      'bot',
      {
        status: statusLevel,
        latencyMs,
        memoryMB: memMB,
        uptimeSeconds: uptimeSec,
        guildCount,
        statusMessage,
        lastHeartbeat: new Date(),
        highLatency: isHighLatency,
      },
      { upsert: true, new: true }
    );

    // Announce online once per process start
    if (!hasAnnouncedOnline) {
      hasAnnouncedOnline = true;
      
      await StatusLog.create({
        service: 'bot',
        type: 'online',
        message: 'FlynnBot has connected to Discord and is fully operational.',
        details: { latencyMs, memoryMB: memMB, guildCount }
      });
      
      await sendStatusWebhook({
        type: 'online',
        title: '✅ FlynnBot — Online',
        description: 'FlynnBot has connected to Discord and is fully operational.',
      });
    }

    // Announce latency spike
    if (isHighLatency && !wasHighLatency) {
      wasHighLatency = true;
      
      await StatusLog.create({
        service: 'bot',
        type: 'degraded',
        message: `FlynnBot is currently experiencing higher than normal latency (${latencyMs} ms).`,
        details: { latencyMs, memoryMB: memMB }
      });

      await sendStatusWebhook({
        type: 'degraded',
        title: '⚠️ FlynnBot — Elevated Latency',
        description: `FlynnBot is currently experiencing higher than normal latency (${latencyMs} ms). Some commands may be slower to respond. We will respond if the issues persist.`,
      });
    }

    // Announce recovery from latency spike
    if (!isHighLatency && wasHighLatency) {
      wasHighLatency = false;
      
      await StatusLog.create({
        service: 'bot',
        type: 'online',
        message: `FlynnBot latency has returned to normal (${latencyMs} ms).`,
        details: { latencyMs, memoryMB: memMB }
      });

      await sendStatusWebhook({
        type: 'online',
        title: '✅ FlynnBot — Latency Recovered',
        description: `FlynnBot latency has returned to normal (${latencyMs} ms). All systems operational.`,
      });
    }
  } catch (err) {
    console.error('[Health] Error reporting bot health:', err.message);
  }
}

/**
 * Mark the bot as offline in MongoDB and notify the webhook.
 */
async function reportOffline(reason = 'Bot has gone offline.') {
  try {
    await BotStatus.findByIdAndUpdate(
      'bot',
      {
        status: 'offline',
        statusMessage: reason,
        highLatency: false,
        lastHeartbeat: new Date(),
      },
      { upsert: true }
    );

    await StatusLog.create({
      service: 'bot',
      type: 'offline',
      message: reason,
      details: {}
    });

    await sendStatusWebhook({
      type: 'offline',
      title: '🔴 FlynnBot — Offline',
      description: reason,
    });
  } catch (err) {
    console.error('[Health] Error reporting offline status:', err.message);
  }
}

/**
 * Start the health reporter. Call once after the bot is ready.
 * Guard prevents duplicate intervals if called more than once.
 */
function startHealthReporter(client) {
  if (reporterInterval) return;

  // Run immediately on start
  report(client);

  reporterInterval = setInterval(() => report(client), INTERVAL_MS);
  console.log('[Health] Bot health reporter started (30-second interval).');
}

/**
 * Stop the reporter (called on graceful shutdown).
 */
function stopHealthReporter() {
  if (reporterInterval) {
    clearInterval(reporterInterval);
    reporterInterval = null;
  }
}

module.exports = { startHealthReporter, stopHealthReporter, reportOffline, OFFLINE_TIMEOUT_MS };

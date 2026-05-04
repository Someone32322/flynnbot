/**
 * Centralized Discord Webhook utility.
 * Sends simple status notifications — no sensitive data, no logs.
 * Used by both the bot and dashboard to post to the public status channel.
 */

const WEBHOOK_URL = process.env.STATUS_WEBHOOK_URL ||
  'https://discord.com/api/webhooks/1500783548670414919/AShRDmY5wG7K7gQFjnaLsoN6N9dXjDqZAmeirGTbDFEz6WrfMkyI8R0WWF0OBVmL3UJ-';

// Colour codes for Discord embed colours
const COLORS = {
  online:   0x2ecc71, // green
  degraded: 0xe67e22, // orange
  offline:  0xe74c3c, // red
  info:     0x3498db, // blue
};

/**
 * Send a status message to the public status webhook.
 * @param {object} options
 * @param {'online'|'degraded'|'offline'|'info'} options.type
 * @param {string} options.title
 * @param {string} options.description
 */
async function sendStatusWebhook({ type = 'info', title, description }) {
  if (!title || !description) return;

  const payload = {
    embeds: [
      {
        title,
        description,
        color: COLORS[type] ?? COLORS.info,
        timestamp: new Date().toISOString(),
        footer: { text: 'FlynnBot Status' },
      },
    ],
  };

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[Webhook] Failed to send status notification: ${res.status} ${text}`);
    }
  } catch (err) {
    console.warn('[Webhook] Error sending status notification:', err.message);
  }
}

module.exports = { sendStatusWebhook };

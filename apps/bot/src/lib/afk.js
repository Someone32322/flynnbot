/**
 * AFK system handler.
 */
const { AFKEntry } = require('../models/AFKEntry');

const cache = new Map(); // guildId:userId -> AFKEntry

async function setAFK(guildId, userId, reason = 'AFK') {
  const entry = await AFKEntry.findOneAndUpdate(
    { guildId, userId },
    { reason: reason.slice(0, 128), setAt: new Date() },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  cache.set(`${guildId}:${userId}`, entry);
  return entry;
}

async function clearAFK(guildId, userId) {
  await AFKEntry.deleteOne({ guildId, userId });
  cache.delete(`${guildId}:${userId}`);
}

async function getAFK(guildId, userId) {
  const key = `${guildId}:${userId}`;
  if (cache.has(key)) return cache.get(key);
  const entry = await AFKEntry.findOne({ guildId, userId }).lean();
  if (entry) cache.set(key, entry);
  return entry || null;
}

/**
 * Handles a message: clears sender's AFK if set, pings back if mentions AFK users.
 * Returns true if the message should be replied to with an AFK notice.
 */
async function handleMessage(message) {
  if (!message.guild || message.author.bot) return;

  // Clear sender's AFK
  const senderAfk = await getAFK(message.guild.id, message.author.id);
  if (senderAfk) {
    await clearAFK(message.guild.id, message.author.id);
    const elapsed = Math.floor((Date.now() - new Date(senderAfk.setAt).getTime()) / 60_000);
    await message.reply(`Welcome back <@${message.author.id}>! You were AFK for ${elapsed} minute(s).`)
      .catch(() => null);
  }

  // Check mentioned users
  const afkNotices = [];
  for (const [, mentioned] of message.mentions.users) {
    if (mentioned.bot) continue;
    const afk = await getAFK(message.guild.id, mentioned.id);
    if (afk) {
      afkNotices.push(`<@${mentioned.id}> is AFK: ${afk.reason}`);
    }
  }

  if (afkNotices.length) {
    await message.reply(afkNotices.join('\n')).catch(() => null);
  }
}

module.exports = { setAFK, clearAFK, getAFK, handleMessage };

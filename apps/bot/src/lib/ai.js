/**
 * ai.js — Groq-powered AI chat integration
 * Handles per-channel AI responses using free Groq LLM API.
 * Config is stored per-guild in AIConfig model.
 */

const Groq = require('groq-sdk');
const AIConfig = require('../models/AIConfig');

// Per-guild config cache (60s TTL)
const configCache = new Map();

async function getAIConfig(guildId) {
  const cached = configCache.get(guildId);
  if (cached && Date.now() - cached.ts < 60_000) return cached.cfg;
  const cfg = await AIConfig.findOne({ guildId }).lean().catch(() => null);
  configCache.set(guildId, { cfg, ts: Date.now() });
  return cfg;
}

function invalidateAICache(guildId) {
  configCache.delete(guildId);
}

/**
 * Called from messageCreate. Checks if channel is AI-enabled and replies.
 * @param {import('discord.js').Message} message
 */
async function handleAIMessage(message) {
  if (message.author.bot || !message.guild) return;

  const cfg = await getAIConfig(message.guild.id);
  if (!cfg?.enabled) return;
  if (!cfg.allowedChannels?.includes(message.channelId)) return;

  // If requireMention is on, bot must be mentioned
  if (cfg.requireMention && !message.mentions.has(message.client.user)) return;

  const userText = message.content
    .replace(/<@!?\d+>/g, '')  // strip all mentions
    .trim();

  if (!userText) return;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn('[AI] GROQ_API_KEY is not set. Skipping AI response.');
    return;
  }

  await message.channel.sendTyping().catch(() => {});

  try {
    const groq = new Groq({ apiKey });

    const completion = await groq.chat.completions.create({
      model: cfg.model || 'llama3-8b-8192',
      messages: [
        { role: 'system', content: cfg.systemPrompt || 'You are a helpful Discord bot assistant. Be concise, friendly, and accurate.' },
        { role: 'user', content: userText.slice(0, 4000) },
      ],
      max_tokens: cfg.maxTokens || 512,
      temperature: cfg.temperature ?? 0.7,
    });

    const reply = completion.choices?.[0]?.message?.content?.trim();
    if (!reply) return;

    // Split long responses into chunks to avoid 2000 char Discord limit
    const chunks = splitMessage(reply, 1900);
    for (const chunk of chunks) {
      await message.reply({ content: chunk, allowedMentions: { parse: [] } });
    }
  } catch (err) {
    console.error('[AI] Groq API error:', err?.message || err);
  }
}

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    const slice = remaining.slice(0, maxLen);
    const lastNewline = slice.lastIndexOf('\n');
    const breakAt = lastNewline > maxLen / 2 ? lastNewline : maxLen;
    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

module.exports = { handleAIMessage, invalidateAICache };

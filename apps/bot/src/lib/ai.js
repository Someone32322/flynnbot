/**
 * ai.js — Groq-powered AI chat integration
 * Handles per-channel AI responses using free Groq LLM API.
 * Config is stored per-guild in AIConfig model.
 */

const Groq = require('groq-sdk');
const AIConfig = require('../models/AIConfig');
const { PermissionsBitField } = require('discord.js');

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

  console.debug(`[AI] messageCreate received guild=${message.guild.id} channel=${message.channelId} author=${message.author.id}`);

  const cfg = await getAIConfig(message.guild.id);
  if (!cfg?.enabled) {
    console.debug(`[AI] skipped: AI disabled for guild=${message.guild.id}`);
    return;
  }

  const allowedChannels = Array.isArray(cfg.allowedChannels) ? cfg.allowedChannels : [];
  const parentChannelId = message.channel?.parentId || null;
  const inAllowedChannel =
    allowedChannels.includes(message.channelId) ||
    (parentChannelId && allowedChannels.includes(parentChannelId));

  if (!inAllowedChannel) {
    console.debug(`[AI] skipped: channel not allowed guild=${message.guild.id} channel=${message.channelId} parent=${parentChannelId || 'none'}`);
    return;
  }

  // If requireMention is on, bot must be mentioned
  if (cfg.requireMention && !message.mentions.has(message.client.user)) {
    console.debug(`[AI] skipped: requireMention enabled and bot not mentioned guild=${message.guild.id}`);
    return;
  }

  const userText = message.content
    .replace(/<@!?\d+>/g, '')  // strip all mentions
    .trim();

  if (!userText) {
    console.debug(`[AI] skipped: empty userText after mention strip guild=${message.guild.id}`);
    return;
  }

  const me = message.guild.members.me;
  if (me) {
    const perms = message.channel?.permissionsFor(me);
    const canView = perms?.has(PermissionsBitField.Flags.ViewChannel);
    const canSend = perms?.has(PermissionsBitField.Flags.SendMessages);
    if (!canView || !canSend) {
      console.warn(`[AI] skipped: missing channel permissions guild=${message.guild.id} channel=${message.channelId} view=${!!canView} send=${!!canSend}`);
      return;
    }
  }

  // Use per-guild API key from DB first, fall back to env var
  const apiKey = cfg.apiKey || process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn(`[AI] No API key found for guild=${message.guild.id}. Set one in the dashboard or via GROQ_API_KEY env var.`);
    return;
  }

  await message.channel.sendTyping().catch(() => {});

  try {
    console.info(`[AI] request:start guild=${message.guild.id} channel=${message.channelId} model=${cfg.model || 'llama3-8b-8192'} promptChars=${Math.min(userText.length, 4000)}`);
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
    console.info(`[AI] request:ok guild=${message.guild.id} channel=${message.channelId}`);

    const reply = completion.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      console.warn(`[AI] skipped: empty completion content guild=${message.guild.id} channel=${message.channelId}`);
      return;
    }

    // Split long responses into chunks to avoid 2000 char Discord limit
    const chunks = splitMessage(reply, 1900);
    for (const chunk of chunks) {
      await message.reply({ content: chunk, allowedMentions: { parse: [] } });
    }
    console.info(`[AI] reply:sent guild=${message.guild.id} channel=${message.channelId} chunks=${chunks.length}`);
  } catch (err) {
    console.error('[AI] Groq API error:', err?.message || err);
    const status = err?.status || err?.response?.status;
    const detail = err?.error?.message || err?.response?.data?.error || null;
    if (status || detail) {
      console.error(`[AI] Groq details status=${status || 'unknown'} detail=${detail || 'n/a'}`);
    }
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

/**
 * Bot-side AutoMod handler.
 *
 * Checks messages against rules stored in AutoModConfig and takes action.
 * Discord's native AutoMod handles keyword/mention-spam/spam/profanity rules.
 * This module handles rules that Discord's native AutoMod cannot:
 *   - Caps filter
 *   - Duplicate message detection
 *   - Mass emoji
 *   - Zalgo / unicode obfuscation
 *   - Invite link filter
 *   - Phishing domain detection
 */

const { AutoModConfig } = require('../models/AutoModConfig');
const { ModerationCase } = require('../models/ModerationCase');
const {
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  AutoModerationActionType,
  AutoModerationRuleKeywordPresetType,
  PermissionFlagsBits,
} = require('discord.js');

// ── In-memory cache ───────────────────────────────────────────────────────────
const configCache = new Map(); // guildId → { config, fetchedAt }
const CONFIG_TTL = 30_000; // 30 seconds

// Duplicate message tracker: guildId:userId → [{ content, ts }]
const dupTracker = new Map();

// ── Cache helpers ─────────────────────────────────────────────────────────────
async function getConfig(guildId) {
  const cached = configCache.get(guildId);
  if (cached && Date.now() - cached.fetchedAt < CONFIG_TTL) return cached.config;
  const config = await AutoModConfig.findOne({ guildId }).lean();
  configCache.set(guildId, { config, fetchedAt: Date.now() });
  return config;
}

function invalidateCache(guildId) {
  configCache.delete(guildId);
}

// ── Zalgo detection ───────────────────────────────────────────────────────────
const ZALGO_RE = /[\u0300-\u036f\u0489\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]{3,}/;

function isZalgo(text) {
  return ZALGO_RE.test(text);
}

// ── Emoji count ───────────────────────────────────────────────────────────────
const EMOJI_RE = /(\p{Emoji_Presentation}|\p{Extended_Pictographic}|<a?:\w+:\d+>)/gu;

function countEmoji(text) {
  return (text.match(EMOJI_RE) || []).length;
}

// ── Invite link detection ─────────────────────────────────────────────────────
const INVITE_RE = /discord(?:\.gg|app\.com\/invite|\.com\/invite)\/[\w-]+/i;

function containsInvite(text) {
  return INVITE_RE.test(text);
}

// ── Basic phishing domain blocklist (extend as needed) ────────────────────────
const PHISHING_DOMAINS = new Set([
  'discordnitro.gift',
  'discord-nitro.gift',
  'steamcommunity.ru',
  'free-nitro.ru',
  'discordgift.site',
  'discord.gift.win',
  'steam-trade.net',
]);

function containsPhishing(text) {
  // Extract potential URLs and check domains
  const urlRe = /https?:\/\/([\w.-]+)/gi;
  let match;
  while ((match = urlRe.exec(text)) !== null) {
    const domain = match[1].toLowerCase();
    for (const bad of PHISHING_DOMAINS) {
      if (domain === bad || domain.endsWith('.' + bad)) return true;
    }
  }
  return false;
}

// ── Action executor ───────────────────────────────────────────────────────────
async function takeAction(message, ruleName, action, config) {
  const { member, guild, channel } = message;
  if (!member || !guild) return;

  // Always attempt to delete the message first
  await message.delete().catch(() => null);

  const alertChannelId = config.alertChannelId;
  const alertChannel = alertChannelId ? guild.channels.cache.get(alertChannelId) : null;

  const logEmbed = {
    color: 0xef4444,
    title: '🛡️ AutoMod Action',
    fields: [
      { name: 'Rule', value: ruleName, inline: true },
      { name: 'Action', value: action, inline: true },
      { name: 'User', value: `<@${member.id}> (${member.user.tag})`, inline: false },
      { name: 'Channel', value: `<#${channel.id}>`, inline: true },
    ],
    timestamp: new Date().toISOString(),
  };

  if (action === 'warn') {
    await member.send({
      content: `⚠️ You were warned in **${guild.name}** for triggering the **${ruleName}** AutoMod rule.`,
    }).catch(() => null);
  } else if (action === 'mute') {
    if (member.moderatable) {
      const until = new Date(Date.now() + 5 * 60 * 1000); // 5 min default
      await member.timeout(5 * 60 * 1000, `AutoMod: ${ruleName}`).catch(() => null);
      await member.send({
        content: `🔇 You were muted in **${guild.name}** for 5 minutes for triggering the **${ruleName}** AutoMod rule.`,
      }).catch(() => null);
    }
  } else if (action === 'kick') {
    if (member.kickable) {
      await member.send({
        content: `👢 You were kicked from **${guild.name}** for triggering the **${ruleName}** AutoMod rule.`,
      }).catch(() => null);
      await member.kick(`AutoMod: ${ruleName}`).catch(() => null);
    }
  } else if (action === 'ban') {
    if (member.bannable) {
      await member.send({
        content: `🔨 You were banned from **${guild.name}** for triggering the **${ruleName}** AutoMod rule.`,
      }).catch(() => null);
      await guild.members.ban(member.id, { reason: `AutoMod: ${ruleName}`, deleteMessageSeconds: 86400 }).catch(() => null);
    }
  }

  if (alertChannel) {
    await alertChannel.send({ embeds: [logEmbed] }).catch(() => null);
  }
}

// ── Is member exempt ──────────────────────────────────────────────────────────
function isExempt(message, config) {
  if (!message.member) return true;
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;

  const memberRoles = message.member.roles.cache.map((r) => r.id);
  if (config.exemptRoles?.some((rid) => memberRoles.includes(rid))) return true;
  if (config.exemptChannels?.includes(message.channelId)) return true;

  return false;
}

// ── Main handler (called from messageCreate) ──────────────────────────────────
async function handleAutoMod(message) {
  if (!message.guild || message.author.bot) return;

  const config = await getConfig(message.guild.id);
  if (!config || !config.enabled) return;
  if (isExempt(message, config)) return;

  const content = message.content || '';
  const rules = config.botRules || {};

  // ── Phishing (highest priority — ban immediately) ──────────────────────────
  if (rules.phishing?.enabled && containsPhishing(content)) {
    await takeAction(message, 'Anti-Phishing', rules.phishing.action || 'ban', config);
    return;
  }

  // ── Invite links ──────────────────────────────────────────────────────────
  if (rules.inviteLinks?.enabled && containsInvite(content)) {
    const allow = rules.inviteLinks.allowOwnServer;
    const guildInvites = allow
      ? await message.guild.invites.fetch().then((inv) => [...inv.values()].map((i) => i.code)).catch(() => [])
      : [];
    const invMatch = content.match(/discord(?:\.gg|app\.com\/invite|\.com\/invite)\/([\w-]+)/i);
    if (invMatch && !guildInvites.includes(invMatch[1])) {
      await takeAction(message, 'Invite Link Filter', rules.inviteLinks.action || 'delete', config);
      return;
    }
  }

  // ── Zalgo ────────────────────────────────────────────────────────────────
  if (rules.zalgo?.enabled && isZalgo(content)) {
    await takeAction(message, 'Anti-Zalgo', rules.zalgo.action || 'delete', config);
    return;
  }

  // ── Mass emoji ────────────────────────────────────────────────────────────
  if (rules.massEmoji?.enabled) {
    const limit = rules.massEmoji.limit ?? 10;
    if (countEmoji(content) > limit) {
      await takeAction(message, 'Mass Emoji Filter', rules.massEmoji.action || 'delete', config);
      return;
    }
  }

  // ── Caps filter ───────────────────────────────────────────────────────────
  if (rules.capsFilter?.enabled) {
    const minLen = rules.capsFilter.minLength ?? 10;
    const threshold = rules.capsFilter.threshold ?? 70;
    if (content.length >= minLen) {
      const letters = content.replace(/[^a-zA-Z]/g, '');
      if (letters.length >= minLen) {
        const upperCount = (letters.match(/[A-Z]/g) || []).length;
        const pct = (upperCount / letters.length) * 100;
        if (pct >= threshold) {
          await takeAction(message, 'Caps Filter', rules.capsFilter.action || 'delete', config);
          return;
        }
      }
    }
  }

  // ── Duplicate messages ────────────────────────────────────────────────────
  if (rules.duplicateMessages?.enabled) {
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const intervalMs = (rules.duplicateMessages.intervalSeconds ?? 10) * 1000;
    const maxCount = rules.duplicateMessages.count ?? 5;

    if (!dupTracker.has(key)) dupTracker.set(key, []);
    const history = dupTracker.get(key).filter((e) => now - e.ts < intervalMs);
    history.push({ content, ts: now });
    dupTracker.set(key, history);

    const matching = history.filter((e) => e.content === content);
    if (matching.length >= maxCount) {
      dupTracker.delete(key);
      await takeAction(message, 'Duplicate Message Filter', rules.duplicateMessages.action || 'delete', config);
      return;
    }
  }
}

// ── Discord AutoMod sync (called by bot's ready + scheduler) ─────────────────
async function syncDiscordAutoMod(guild, config) {
  if (!config) return;

  const { discordRules } = config;
  if (!discordRules) return;

  const keywordPresetMap = {
    PROFANITY: AutoModerationRuleKeywordPresetType.Profanity,
    SEXUAL_CONTENT: AutoModerationRuleKeywordPresetType.SexualContent,
    SLURS: AutoModerationRuleKeywordPresetType.Slurs,
  };

  function buildActions(rule) {
    const actions = [{ type: AutoModerationActionType.BlockMessage }];
    if (rule.action === 'block_alert' || rule.action === 'block_timeout') {
      if (config.alertChannelId) {
        actions.push({
          type: AutoModerationActionType.SendAlertMessage,
          metadata: { channelId: config.alertChannelId },
        });
      }
    }
    if (rule.action === 'block_timeout') {
      actions.push({
        type: AutoModerationActionType.Timeout,
        metadata: { durationSeconds: rule.timeoutSeconds ?? 60 },
      });
    }
    return actions;
  }

  const exemptRoles = config.exemptRoles || [];
  const exemptChannels = config.exemptChannels || [];

  async function upsertRule(ruleId, createOptions) {
    try {
      if (ruleId) {
        const existing = await guild.autoModerationRules.fetch(ruleId).catch(() => null);
        if (existing) {
          return await existing.edit(createOptions);
        }
      }
      return await guild.autoModerationRules.create(createOptions);
    } catch (err) {
      console.error(`[AutoMod Sync] Error upserting rule in ${guild.id}:`, err.message);
      return null;
    }
  }

  async function deleteRule(ruleId) {
    if (!ruleId) return;
    try {
      await guild.autoModerationRules.delete(ruleId);
    } catch {
      // Rule may not exist
    }
  }

  const updates = {};

  // ── Keyword rule ──────────────────────────────────────────────────────────
  if (discordRules.keyword?.enabled && discordRules.keyword.keywords?.length > 0) {
    const rule = await upsertRule(discordRules.keyword.discordRuleId, {
      name: 'FlynnBot – Keyword Filter',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: {
        keywordFilter: discordRules.keyword.keywords.slice(0, 1000),
        regexPatterns: (discordRules.keyword.regex || []).slice(0, 10),
      },
      actions: buildActions(discordRules.keyword),
      enabled: true,
      exemptRoles,
      exemptChannels,
    });
    if (rule) updates['discordRules.keyword.discordRuleId'] = rule.id;
  } else if (discordRules.keyword?.discordRuleId) {
    await deleteRule(discordRules.keyword.discordRuleId);
    updates['discordRules.keyword.discordRuleId'] = null;
  }

  // ── Mention spam rule ─────────────────────────────────────────────────────
  if (discordRules.mentionSpam?.enabled) {
    const rule = await upsertRule(discordRules.mentionSpam.discordRuleId, {
      name: 'FlynnBot – Mention Spam',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.MentionSpam,
      triggerMetadata: { mentionTotalLimit: discordRules.mentionSpam.mentionLimit ?? 5 },
      actions: buildActions(discordRules.mentionSpam),
      enabled: true,
      exemptRoles,
      exemptChannels,
    });
    if (rule) updates['discordRules.mentionSpam.discordRuleId'] = rule.id;
  } else if (discordRules.mentionSpam?.discordRuleId) {
    await deleteRule(discordRules.mentionSpam.discordRuleId);
    updates['discordRules.mentionSpam.discordRuleId'] = null;
  }

  // ── Spam rule ─────────────────────────────────────────────────────────────
  if (discordRules.spam?.enabled) {
    const rule = await upsertRule(discordRules.spam.discordRuleId, {
      name: 'FlynnBot – Anti-Spam',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Spam,
      actions: buildActions(discordRules.spam),
      enabled: true,
      exemptRoles,
      exemptChannels,
    });
    if (rule) updates['discordRules.spam.discordRuleId'] = rule.id;
  } else if (discordRules.spam?.discordRuleId) {
    await deleteRule(discordRules.spam.discordRuleId);
    updates['discordRules.spam.discordRuleId'] = null;
  }

  // ── Profanity preset rule ─────────────────────────────────────────────────
  if (discordRules.profanity?.enabled && discordRules.profanity.presets?.length > 0) {
    const rule = await upsertRule(discordRules.profanity.discordRuleId, {
      name: 'FlynnBot – Profanity Filter',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.KeywordPreset,
      triggerMetadata: {
        presets: discordRules.profanity.presets.map((p) => keywordPresetMap[p]).filter(Boolean),
        allowList: (discordRules.profanity.allowList || []).slice(0, 100),
      },
      actions: buildActions(discordRules.profanity),
      enabled: true,
      exemptRoles,
      exemptChannels,
    });
    if (rule) updates['discordRules.profanity.discordRuleId'] = rule.id;
  } else if (discordRules.profanity?.discordRuleId) {
    await deleteRule(discordRules.profanity.discordRuleId);
    updates['discordRules.profanity.discordRuleId'] = null;
  }

  // Persist updated rule IDs and clear syncNeeded flag
  if (Object.keys(updates).length > 0 || config.syncNeeded) {
    await AutoModConfig.updateOne(
      { guildId: guild.id },
      { $set: { ...updates, syncNeeded: false } },
    ).catch((err) => console.error('[AutoMod Sync] DB update error:', err.message));
  }

  invalidateCache(guild.id);
}

module.exports = { handleAutoMod, syncDiscordAutoMod, invalidateCache };

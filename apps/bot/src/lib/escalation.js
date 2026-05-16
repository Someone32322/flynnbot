/**
 * escalation.js — Moderation escalation handler.
 * After a warn is issued, checks the guild's escalation config and automatically
 * applies the configured action (mute/tempmute/kick/ban) when warn thresholds are met.
 */

const { EscalationConfig } = require('../models/EscalationConfig');
const { ModerationCase } = require('../models/ModerationCase');

const configCache = new Map();
const CONFIG_TTL = 30_000;

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // Discord's max timeout

async function getConfig(guildId) {
  const cached = configCache.get(guildId);
  if (cached && Date.now() - cached.ts < CONFIG_TTL) return cached.cfg;
  const cfg = await EscalationConfig.findOne({ guildId }).lean().catch(() => null);
  configCache.set(guildId, { cfg, ts: Date.now() });
  return cfg;
}

function invalidateCache(guildId) {
  configCache.delete(guildId);
}

/**
 * Called immediately after a warn is issued. Checks escalation rules and applies
 * the configured action if the user's warn count matches a rule.
 *
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').GuildMember|null} member
 * @param {import('discord.js').User} targetUser
 */
async function checkEscalation(guild, member, targetUser) {
  if (!member) return;

  const config = await getConfig(guild.id);
  if (!config?.enabled || !config.rules?.length) return;

  // Count active (non-removed) warns for this user in this guild
  const warnCount = await ModerationCase.countDocuments({
    guildId: guild.id,
    targetUserId: targetUser.id,
    type: 'warn',
    removedAt: null,
  }).catch(() => 0);

  if (!warnCount) return;

  // Find the rule that exactly matches the current warn count
  const rule = config.rules.find((r) => r.warnCount === warnCount);
  if (!rule) return;

  const reason = `Auto-escalation: ${warnCount} warning(s) reached`;

  console.info(`[Escalation] Applying ${rule.action} to ${targetUser.id} in guild ${guild.id} (${warnCount} warns)`);

  try {
    if (rule.action === 'mute') {
      // Permanent-ish mute: timeout for max allowed duration
      if (member.moderatable) {
        await member.timeout(MAX_TIMEOUT_MS, reason).catch(() => null);
        await targetUser.send(
          `🔇 You have been muted in **${guild.name}** due to reaching **${warnCount}** warning(s).`
        ).catch(() => null);
      }
    } else if (rule.action === 'tempmute') {
      const durationMs = Math.min((rule.duration || 60) * 60_000, MAX_TIMEOUT_MS);
      if (member.moderatable) {
        await member.timeout(durationMs, reason).catch(() => null);
        await targetUser.send(
          `🔇 You have been temporarily muted in **${guild.name}** for **${rule.duration || 60} minute(s)** due to reaching **${warnCount}** warning(s).`
        ).catch(() => null);
      }
    } else if (rule.action === 'kick') {
      if (member.kickable) {
        await targetUser.send(
          `👢 You have been kicked from **${guild.name}** due to reaching **${warnCount}** warning(s).`
        ).catch(() => null);
        await member.kick(reason).catch(() => null);
      }
    } else if (rule.action === 'ban') {
      if (member.bannable) {
        await targetUser.send(
          `🔨 You have been banned from **${guild.name}** due to reaching **${warnCount}** warning(s).`
        ).catch(() => null);
        await guild.members.ban(targetUser.id, { reason, deleteMessageSeconds: 0 }).catch(() => null);
      }
    }
  } catch (err) {
    console.error('[Escalation] Error applying escalation action:', err?.message || err);
  }
}

module.exports = { checkEscalation, invalidateCache };

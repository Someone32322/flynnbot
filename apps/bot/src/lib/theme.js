/**
 * theme.js — Theme system helper
 * Provides applyTheme() which applies server-level embed styling to any EmbedBuilder.
 * Used by leveling, moderation, and other systems that send embeds.
 */

const { EmbedBuilder } = require('discord.js');
const ThemeConfig = require('../models/ThemeConfig');

// Per-guild theme cache (60s TTL)
const themeCache = new Map();

async function getTheme(guildId) {
  const cached = themeCache.get(guildId);
  if (cached && Date.now() - cached.ts < 60_000) return cached.theme;
  const theme = await ThemeConfig.findOne({ guildId }).lean().catch(() => null);
  themeCache.set(guildId, { theme, ts: Date.now() });
  return theme;
}

function invalidateThemeCache(guildId) {
  themeCache.delete(guildId);
}

/**
 * Apply server theme to an EmbedBuilder.
 * Only sets values if theme has them; preserves any already-set values on embed.
 * @param {EmbedBuilder} embed
 * @param {string} guildId
 * @param {import('discord.js').Guild?} guild - Pass for useServerIcon
 * @returns {Promise<EmbedBuilder>}
 */
async function applyTheme(embed, guildId, guild = null) {
  const theme = await getTheme(guildId);
  if (!theme) return embed;

  if (theme.embedColor) {
    try { embed.setColor(theme.embedColor); } catch {}
  }

  if (theme.showTimestamp) embed.setTimestamp();

  if (theme.embedFooterText) {
    const iconURL = theme.embedFooterIconUrl || undefined;
    embed.setFooter({ text: theme.embedFooterText.slice(0, 200), iconURL });
  }

  if (theme.embedAuthorName) {
    const iconURL = theme.embedAuthorIconUrl || undefined;
    embed.setAuthor({ name: theme.embedAuthorName.slice(0, 200), iconURL });
  }

  if (theme.useServerIcon && guild?.iconURL) {
    embed.setThumbnail(guild.iconURL({ extension: 'png', size: 128 }));
  } else if (theme.thumbnailUrl) {
    embed.setThumbnail(theme.thumbnailUrl);
  }

  return embed;
}

module.exports = { applyTheme, invalidateThemeCache };

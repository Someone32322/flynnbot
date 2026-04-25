const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { LevelConfig } = require("../models/LevelConfig");
const { LevelProfile } = require("../models/LevelProfile");

const SAPPHIRE = 0x0f52ba;
const DEFAULT_FORMULA = { a: 5, b: 50, c: 100 };
const DEFAULT_LEVEL_CONFIG = {
  enabled: true,
  xpRate: 15,
  xpCooldown: 60,
  xpChannels: [],
  rewards: [],
  levelUpMessage: "Congrats {user}! You reached level {level} in {server}.",
  levelUpChannelId: null,
  roleStack: true,
  formula: { ...DEFAULT_FORMULA },
};

const cooldownCache = new Map();
const configCache = new Map();

function cacheKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function nowMs() {
  return Date.now();
}

function buildLevelEmbed(title, description, fields = []) {
  const embed = new EmbedBuilder().setColor(SAPPHIRE).setTitle(title);
  if (description) embed.setDescription(description);
  if (fields.length) embed.addFields(fields);
  return embed;
}

function normalizeFormula(formula) {
  const a = Number(formula?.a);
  const b = Number(formula?.b);
  const c = Number(formula?.c);
  return {
    a: Number.isFinite(a) ? a : DEFAULT_FORMULA.a,
    b: Number.isFinite(b) ? b : DEFAULT_FORMULA.b,
    c: Number.isFinite(c) ? c : DEFAULT_FORMULA.c,
  };
}

function xpNeededForNext(level, formula = DEFAULT_FORMULA) {
  const f = normalizeFormula(formula);
  return Math.max(1, Math.floor(f.a * level * level + f.b * level + f.c));
}

function totalXpForLevel(level, formula = DEFAULT_FORMULA) {
  let total = 0;
  for (let i = 0; i < level; i++) total += xpNeededForNext(i, formula);
  return total;
}

function levelFromXp(xp, formula = DEFAULT_FORMULA) {
  let level = 0;
  let remaining = Math.max(0, Number(xp) || 0);
  while (remaining >= xpNeededForNext(level, formula)) {
    remaining -= xpNeededForNext(level, formula);
    level += 1;
    if (level >= 10_000) break;
  }
  return level;
}

function progressForXp(xp, level, formula = DEFAULT_FORMULA) {
  const safeXp = Math.max(0, Number(xp) || 0);
  const currentBase = totalXpForLevel(level, formula);
  const nextBase = totalXpForLevel(level + 1, formula);
  const span = Math.max(1, nextBase - currentBase);
  const within = Math.max(0, safeXp - currentBase);
  const ratio = Math.min(1, within / span);
  return {
    currentBase,
    nextBase,
    span,
    within,
    ratio,
    needed: Math.max(0, nextBase - safeXp),
  };
}

function progressBar(ratio, size = 16) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const full = Math.round(clamped * size);
  return "█".repeat(full) + "░".repeat(size - full);
}

async function getLevelConfig(guildId, { bypassCache = false } = {}) {
  const cache = configCache.get(guildId);
  if (!bypassCache && cache && nowMs() - cache.ts < 30_000) return cache.data;

  const db = await LevelConfig.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId, ...DEFAULT_LEVEL_CONFIG } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  const normalized = {
    ...DEFAULT_LEVEL_CONFIG,
    ...db,
    formula: normalizeFormula(db?.formula),
    rewards: Array.isArray(db?.rewards) ? [...db.rewards].sort((a, b) => a.level - b.level) : [],
    xpChannels: Array.isArray(db?.xpChannels) ? db.xpChannels : [],
  };

  configCache.set(guildId, { ts: nowMs(), data: normalized });
  return normalized;
}

async function updateLevelConfig(guildId, update) {
  const doc = await LevelConfig.findOneAndUpdate(
    { guildId },
    { $set: update, $setOnInsert: { guildId, ...DEFAULT_LEVEL_CONFIG } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  configCache.delete(guildId);
  return doc;
}

async function getOrCreateLevelProfile(guildId, userId) {
  return LevelProfile.findOneAndUpdate(
    { guildId, userId },
    { $setOnInsert: { guildId, userId, xp: 0, level: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function recalcProfileLevel(guildId, userId, formula) {
  const profile = await getOrCreateLevelProfile(guildId, userId);
  const computedLevel = levelFromXp(profile.xp, formula);
  if (profile.level !== computedLevel) {
    profile.level = computedLevel;
    await profile.save();
  }
  return profile;
}

function renderLevelMessage(template, member, level) {
  return String(template || DEFAULT_LEVEL_CONFIG.levelUpMessage)
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{level}", String(level))
    .replaceAll("{server}", member.guild.name);
}

async function applyLevelRewards(member, config, level) {
  const rewards = (config.rewards || [])
    .filter((r) => Number.isFinite(r.level) && r.level <= level && r.roleId)
    .sort((a, b) => a.level - b.level);

  if (!rewards.length) return;

  const eligibleRoleIds = rewards.map((r) => r.roleId);
  const highestEligible = rewards[rewards.length - 1]?.roleId;

  if (config.roleStack) {
    for (const roleId of eligibleRoleIds) {
      if (!member.roles.cache.has(roleId)) {
        await member.roles.add(roleId).catch(() => null);
      }
    }
    return;
  }

  for (const roleId of eligibleRoleIds) {
    if (roleId !== highestEligible && member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId).catch(() => null);
    }
  }
  if (highestEligible && !member.roles.cache.has(highestEligible)) {
    await member.roles.add(highestEligible).catch(() => null);
  }
}

async function maybeAwardXpForMessage(message) {
  if (!message.guild || message.author?.bot) return null;

  const config = await getLevelConfig(message.guild.id);
  if (!config.enabled) return null;
  if (config.xpChannels.length > 0 && !config.xpChannels.includes(message.channelId)) return null;

  const key = cacheKey(message.guild.id, message.author.id);
  const last = cooldownCache.get(key) || 0;
  if (config.xpCooldown > 0 && nowMs() - last < config.xpCooldown * 1000) return null;
  cooldownCache.set(key, nowMs());

  const profile = await getOrCreateLevelProfile(message.guild.id, message.author.id);
  const oldLevel = profile.level;
  const gain = Math.max(1, Number(config.xpRate) || DEFAULT_LEVEL_CONFIG.xpRate);
  profile.xp = Math.max(0, (profile.xp || 0) + gain);
  profile.level = levelFromXp(profile.xp, config.formula);
  await profile.save();

  if (profile.level <= oldLevel) {
    return { leveledUp: false, profile };
  }

  const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (member) {
    await applyLevelRewards(member, config, profile.level);
  }

  const targetChannel =
    (config.levelUpChannelId && message.guild.channels.cache.get(config.levelUpChannelId)) ||
    message.channel;

  if (targetChannel?.isTextBased()) {
    const text = renderLevelMessage(config.levelUpMessage, member || { ...message.author, guild: message.guild, id: message.author.id }, profile.level);
    await targetChannel.send({
      embeds: [buildLevelEmbed("Level Up!", text)],
    }).catch(() => null);
  }

  return { leveledUp: true, profile, oldLevel };
}

async function computeRank(guildId, xp) {
  return (await LevelProfile.countDocuments({ guildId, xp: { $gt: xp } })) + 1;
}

async function buildRankCard(member, profile, config, rank) {
  const width = 920;
  const height = 280;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#0a1630");
  gradient.addColorStop(1, "#1d3f7a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(24, 24, width - 48, height - 48);

  const avatarUrl = member.displayAvatarURL({ extension: "png", size: 256 });
  const avatar = await loadImage(avatarUrl);
  ctx.save();
  ctx.beginPath();
  ctx.arc(120, 140, 72, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, 48, 68, 144, 144);
  ctx.restore();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px sans-serif";
  ctx.fillText(member.user.tag, 220, 110);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "24px sans-serif";
  ctx.fillText(`Rank #${rank}`, 220, 150);
  ctx.fillText(`Level ${profile.level}`, 380, 150);

  const progress = progressForXp(profile.xp, profile.level, config.formula);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(220, 184, 620, 28);
  ctx.fillStyle = "#4f9eff";
  ctx.fillRect(220, 184, Math.floor(620 * progress.ratio), 28);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "20px sans-serif";
  ctx.fillText(`${profile.xp} XP (${progress.needed} XP to next level)`, 220, 238);

  const buffer = await canvas.encode("png");
  return new AttachmentBuilder(buffer, { name: "rank-card.png" });
}

module.exports = {
  SAPPHIRE,
  DEFAULT_FORMULA,
  DEFAULT_LEVEL_CONFIG,
  buildLevelEmbed,
  normalizeFormula,
  xpNeededForNext,
  totalXpForLevel,
  levelFromXp,
  progressForXp,
  progressBar,
  getLevelConfig,
  updateLevelConfig,
  getOrCreateLevelProfile,
  recalcProfileLevel,
  renderLevelMessage,
  applyLevelRewards,
  maybeAwardXpForMessage,
  computeRank,
  buildRankCard,
  LevelProfile,
};

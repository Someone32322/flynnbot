/**
 * economy.js — Core economy utility functions for FlynnBot
 * Handles profile fetching, balance operations, cooldowns, and formatting.
 */

const { EconomyProfile } = require('../models/EconomyProfile');
const { EconomyConfig } = require('../models/EconomyConfig');
const { EmbedBuilder } = require('discord.js');

const SAPPHIRE = 0x0f52ba;
const GOLD = 0xffd700;
const RED = 0xe74c3c;
const GREEN = 0x2ecc71;

// ── Fish & Hunt loot tables ──────────────────────────────────

const FISH_TABLE = [
  { itemId: 'small_fish', name: 'Small Fish', emoji: '🐟', value: 20, weight: 40 },
  { itemId: 'bass', name: 'Bass', emoji: '🎣', value: 60, weight: 30 },
  { itemId: 'salmon', name: 'Salmon', emoji: '🐠', value: 120, weight: 18 },
  { itemId: 'trout', name: 'Trout', emoji: '🐡', value: 180, weight: 8 },
  { itemId: 'golden_fish', name: 'Golden Fish', emoji: '✨🐟', value: 800, weight: 3 },
  { itemId: 'legendary_carp', name: 'Legendary Carp', emoji: '👑🐟', value: 2000, weight: 1 },
];

const HUNT_TABLE = [
  { itemId: 'rabbit', name: 'Rabbit', emoji: '🐇', value: 30, weight: 35 },
  { itemId: 'deer', name: 'Deer', emoji: '🦌', value: 80, weight: 28 },
  { itemId: 'fox', name: 'Fox', emoji: '🦊', value: 150, weight: 18 },
  { itemId: 'boar', name: 'Boar', emoji: '🐗', value: 250, weight: 12 },
  { itemId: 'wolf', name: 'Wolf', emoji: '🐺', value: 500, weight: 5 },
  { itemId: 'legendary_dragon', name: 'Legendary Dragon', emoji: '🐉', value: 3000, weight: 2 },
];

const WORK_JOBS = [
  { name: 'Programmer', msg: 'You wrote some excellent code for a client' },
  { name: 'Chef', msg: 'You cooked a 5-star meal at a fancy restaurant' },
  { name: 'Streamer', msg: 'You went live and pulled amazing donations' },
  { name: 'Artist', msg: 'You sold a beautiful painting at an auction' },
  { name: 'Mechanic', msg: 'You fixed several cars at the garage' },
  { name: 'Security Guard', msg: 'You kept the night shift in check' },
  { name: 'Gamer', msg: 'You won a local esports tournament' },
  { name: 'Teacher', msg: 'You gave an amazing lecture today' },
  { name: 'Musician', msg: 'You performed on stage and collected tips' },
  { name: 'Trader', msg: 'You executed a profitable stock trade' },
];

const CRIME_EVENTS = [
  { msg: 'You pickpocketed a wealthy banker', failMsg: 'You tried to pickpocket someone but got caught!' },
  { msg: 'You hacked into a corporation and drained their bonus pool', failMsg: 'You attempted a hack but set off the alarm!' },
  { msg: 'You robbed a convenience store', failMsg: 'You tried to rob a store but tripped on the way out!' },
  { msg: 'You forged some documents and sold them', failMsg: 'Your forged documents were detected by the authorities!' },
  { msg: 'You ran an underground gambling ring', failMsg: 'Your illegal gambling ring was raided!' },
  { msg: 'You smuggled some goods across the border', failMsg: 'Border control caught your shipment!' },
];

const BEG_MESSAGES = [
  'Please have mercy on me!',
  'I haven\'t eaten in days...',
  'Just a few coins, kind stranger?',
  'I\'ll be your best friend!',
  'I promise I won\'t spend it all on gambling... probably.',
];

const BEG_GIVERS = [
  'A passing traveler',
  'A generous merchant',
  'A rich noble',
  'A kind old lady',
  'A suspicious stranger',
  'The server itself',
];

// ── Config cache ──────────────────────────────────────────────

const configCache = new Map(); // guildId → { config, fetchedAt }
const CONFIG_TTL = 30_000; // 30 seconds

async function getConfig(guildId) {
  const cached = configCache.get(guildId);
  if (cached && Date.now() - cached.fetchedAt < CONFIG_TTL) return cached.config;

  let cfg = await EconomyConfig.findOne({ guildId }).lean();
  if (!cfg) {
    cfg = await EconomyConfig.findOneAndUpdate(
      { guildId },
      { $setOnInsert: { guildId } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean();
  }
  configCache.set(guildId, { config: cfg, fetchedAt: Date.now() });
  return cfg;
}

function invalidateConfigCache(guildId) {
  configCache.delete(guildId);
}

// ── Profile helpers ───────────────────────────────────────────

async function getProfile(guildId, userId) {
  let profile = await EconomyProfile.findOne({ guildId, userId });
  if (!profile) {
    const cfg = await getConfig(guildId);
    profile = new EconomyProfile({
      guildId,
      userId,
      wallet: cfg.startingBalance ?? 500,
      bank: 0,
      bankCap: cfg.defaultBankCap ?? 50000,
    });
    await profile.save();
  }
  return profile;
}

async function addToWallet(guildId, userId, amount) {
  const profile = await getProfile(guildId, userId);
  profile.wallet = Math.max(0, profile.wallet + amount);
  if (amount > 0) profile.totalEarned = (profile.totalEarned || 0) + amount;
  else profile.totalSpent = (profile.totalSpent || 0) + Math.abs(amount);
  profile.netWorth = profile.wallet + profile.bank;
  await profile.save();
  return profile;
}

async function addToBank(guildId, userId, amount) {
  const profile = await getProfile(guildId, userId);
  profile.bank = Math.max(0, Math.min(profile.bankCap, profile.bank + amount));
  profile.netWorth = profile.wallet + profile.bank;
  await profile.save();
  return profile;
}

// ── Cooldown helpers ──────────────────────────────────────────

function msToHuman(ms) {
  if (ms <= 0) return 'now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function checkCooldown(lastUse, cooldownMs) {
  if (!lastUse) return { ready: true, remaining: 0 };
  const elapsed = Date.now() - new Date(lastUse).getTime();
  const remaining = cooldownMs - elapsed;
  return { ready: remaining <= 0, remaining: Math.max(0, remaining) };
}

// ── Weighted random ───────────────────────────────────────────

function weightedRandom(table) {
  const total = table.reduce((sum, item) => sum + item.weight, 0);
  let rand = Math.random() * total;
  for (const item of table) {
    rand -= item.weight;
    if (rand <= 0) return item;
  }
  return table[table.length - 1];
}

// ── Formatting ────────────────────────────────────────────────

function formatCoins(cfg, amount) {
  const sym = cfg.currencySymbol || '💎';
  const name = cfg.currencyName || 'Flynn Coins';
  return `${sym} **${amount.toLocaleString()}** ${name}`;
}

function formatCurrency(cfg) {
  return `${cfg.currencySymbol || '💎'} ${cfg.currencyName || 'Flynn Coins'}`;
}

// ── Embed builders ────────────────────────────────────────────

function economyEmbed(title, description, color = SAPPHIRE) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: 'FlynnBot Economy' });
}

function cooldownEmbed(action, remaining) {
  return economyEmbed(
    '⏱️ Slow down!',
    `You need to wait **${msToHuman(remaining)}** before you can **${action}** again.`,
    RED
  );
}

function disabledEmbed() {
  return economyEmbed(
    '❌ Economy Disabled',
    'The economy system is currently disabled in this server.',
    RED
  );
}

// ── Channel check ─────────────────────────────────────────────

function isChannelAllowed(cfg, channelId) {
  if (!cfg.allowedChannels || cfg.allowedChannels.length === 0) return true;
  return cfg.allowedChannels.includes(channelId);
}

module.exports = {
  getConfig,
  invalidateConfigCache,
  getProfile,
  addToWallet,
  addToBank,
  checkCooldown,
  msToHuman,
  weightedRandom,
  formatCoins,
  formatCurrency,
  economyEmbed,
  cooldownEmbed,
  disabledEmbed,
  isChannelAllowed,
  FISH_TABLE,
  HUNT_TABLE,
  WORK_JOBS,
  CRIME_EVENTS,
  BEG_MESSAGES,
  BEG_GIVERS,
  SAPPHIRE,
  GOLD,
  RED,
  GREEN,
};

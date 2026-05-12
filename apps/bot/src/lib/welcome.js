/**
 * Welcome / Goodbye handler for the bot.
 *
 * Handles:
 *  - Welcome messages (channel + DM)
 *  - Goodbye messages
 *  - Auto-role assignment on join
 *  - Account age check on join
 *
 * Variable reference:
 *   {user}       → @mention
 *   {tag}        → Username#0000 (or Username for new usernames)
 *   {username}   → Username (without discriminator)
 *   {server}     → Server name
 *   {count}      → Current member count
 *   {id}         → User ID
 *   {accountAge} → Age of the Discord account in days
 */

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { WelcomeConfig } = require('../models/WelcomeConfig');

const configCache = new Map();
const CONFIG_TTL = 30_000;

async function getConfig(guildId) {
  const cached = configCache.get(guildId);
  if (cached && Date.now() - cached.fetchedAt < CONFIG_TTL) return cached.config;
  const config = await WelcomeConfig.findOne({ guildId }).lean();
  configCache.set(guildId, { config, fetchedAt: Date.now() });
  return config;
}

function interpolate(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => {
    return vars[key] !== undefined ? vars[key] : `{${key}}`;
  });
}

function buildVars(member) {
  const { user, guild } = member;
  const accountAgeDays = Math.floor((Date.now() - user.createdTimestamp) / 86_400_000);
  return {
    user: `<@${user.id}>`,
    tag: user.tag ?? user.username,
    username: user.username,
    server: guild.name,
    count: String(guild.memberCount),
    id: user.id,
    accountAge: String(accountAgeDays),
  };
}

// ── Welcome on join ───────────────────────────────────────────────────────────
async function handleMemberJoin(member) {
  const { guild, user } = member;
  const config = await getConfig(guild.id);
  if (!config) return;

  const vars = buildVars(member);

  // ── Auto-roles ─────────────────────────────────────────────────────────────
  const autoRoles = config.welcome?.autoRoles || [];
  for (const roleId of autoRoles) {
    const role = guild.roles.cache.get(roleId);
    if (role && role.editable) {
      await member.roles.add(role, 'Auto-role on join').catch(() => null);
    }
  }

  // ── Account age check ──────────────────────────────────────────────────────
  const ageCheck = config.welcome?.accountAgeCheck;
  if (ageCheck?.enabled) {
    const accountAgeDays = Math.floor((Date.now() - user.createdTimestamp) / 86_400_000);
    if (accountAgeDays < (ageCheck.minDays ?? 7)) {
      const warnChannel = ageCheck.warnChannelId
        ? guild.channels.cache.get(ageCheck.warnChannelId)
        : null;
      if (warnChannel) {
        await warnChannel.send({
          embeds: [{
            color: 0xf59e0b,
            title: '⚠️ New Account Detected',
            description: `<@${user.id}> joined but their account is only **${accountAgeDays} day(s)** old (minimum: ${ageCheck.minDays}).`,
            footer: { text: `User ID: ${user.id}` },
            timestamp: new Date().toISOString(),
          }],
        }).catch(() => null);
      }
    }
  }

  // ── Welcome message ────────────────────────────────────────────────────────
  const welcome = config.welcome;
  if (!welcome?.enabled) return;

  const welcomeChannel = welcome.channelId ? guild.channels.cache.get(welcome.channelId) : null;

  if (welcomeChannel) {
    if (welcome.embedEnabled) {
      const embed = new EmbedBuilder()
        .setColor(welcome.embed?.color || '#5865f2')
        .setTitle(interpolate(welcome.embed?.title || 'Welcome to {server}!', vars))
        .setDescription(interpolate(welcome.embed?.description || 'Hey {user}, welcome!', vars));

      if (welcome.embed?.footer) embed.setFooter({ text: interpolate(welcome.embed.footer, vars) });
      if (welcome.embed?.thumbnail) embed.setThumbnail(user.displayAvatarURL({ size: 256 }));

      await welcomeChannel.send({ embeds: [embed] }).catch(() => null);
    } else {
      await welcomeChannel.send({ content: interpolate(welcome.message, vars) }).catch(() => null);
    }
  }

  // ── DM on join ─────────────────────────────────────────────────────────────
  if (welcome.dmEnabled && welcome.dmMessage) {
    await user.send({ content: interpolate(welcome.dmMessage, vars) }).catch(() => null);
  }
}

// ── Goodbye on leave ──────────────────────────────────────────────────────────
async function handleMemberLeave(member) {
  const { guild, user } = member;
  const config = await getConfig(guild.id);
  if (!config) return;

  const goodbye = config.goodbye;
  if (!goodbye?.enabled) return;

  const goodbyeChannel = goodbye.channelId ? guild.channels.cache.get(goodbye.channelId) : null;
  if (!goodbyeChannel) return;

  const vars = buildVars(member);

  if (goodbye.embedEnabled) {
    const embed = new EmbedBuilder()
      .setColor(goodbye.embed?.color || '#ef4444')
      .setTitle(interpolate(goodbye.embed?.title || '{tag} left', vars))
      .setDescription(interpolate(goodbye.embed?.description || '**{tag}** has left the server.', vars));

    if (goodbye.embed?.footer) embed.setFooter({ text: interpolate(goodbye.embed.footer, vars) });
    if (goodbye.embed?.thumbnail) embed.setThumbnail(user.displayAvatarURL({ size: 256 }));

    await goodbyeChannel.send({ embeds: [embed] }).catch(() => null);
  } else {
    await goodbyeChannel.send({ content: interpolate(goodbye.message, vars) }).catch(() => null);
  }
}

function invalidateCache(guildId) {
  configCache.delete(guildId);
}

// ── Test send (triggered by dashboard) ────────────────────────────────────────
async function sendTestWelcomeMessage(guild, type, channelId) {
  const config = await getConfig(guild.id);
  if (!config) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;

  const user = guild.client.user;
  const vars = {
    user: `<@${user.id}>`,
    tag: user.tag ?? user.username,
    username: user.username,
    server: guild.name,
    count: String(guild.memberCount),
    id: user.id,
    accountAge: '30',
  };

  const section = type === 'welcome' ? config.welcome : config.goodbye;
  if (!section) return;

  if (section.embedEnabled) {
    const embed = new EmbedBuilder()
      .setColor(section.embed?.color || (type === 'welcome' ? '#5865f2' : '#ef4444'))
      .setTitle(interpolate(section.embed?.title || (type === 'welcome' ? 'Welcome to {server}!' : '{tag} left'), vars))
      .setDescription(interpolate(section.embed?.description || (type === 'welcome' ? 'Hey {user}!' : '**{tag}** has left.'), vars));
    if (section.embed?.footer) embed.setFooter({ text: interpolate(section.embed.footer, vars) });
    if (section.embed?.thumbnail) embed.setThumbnail(user.displayAvatarURL({ size: 256 }));
    await channel.send({ content: `*(Test ${type} message)*`, embeds: [embed] }).catch(() => null);
  } else {
    const msg = interpolate(section.message || (type === 'welcome' ? 'Welcome {user}!' : '**{tag}** has left.'), vars);
    await channel.send({ content: `*(Test ${type} message)* ${msg}` }).catch(() => null);
  }
}

module.exports = { handleMemberJoin, handleMemberLeave, invalidateCache, sendTestWelcomeMessage };

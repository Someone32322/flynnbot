/**
 * Stats Channels handler — updates dynamic voice channel names with server stats.
 */
const { StatsConfig } = require('../models/StatsConfig');

const configCache = new Map();
const CONFIG_TTL = 60_000;

async function getConfig(guildId) {
  const cached = configCache.get(guildId);
  if (cached && Date.now() - cached.at < CONFIG_TTL) return cached.config;
  const config = await StatsConfig.findOne({ guildId }).lean();
  configCache.set(guildId, { config, at: Date.now() });
  return config;
}

function invalidateCache(guildId) {
  configCache.delete(guildId);
}

function buildChannelName(template, guild) {
  const replacements = {
    '{members}': guild.memberCount,
    '{online}': guild.members.cache.filter((m) => m.presence?.status !== 'offline').size,
    '{bots}': guild.members.cache.filter((m) => m.user.bot).size,
    '{boosts}': guild.premiumSubscriptionCount || 0,
    '{channels}': guild.channels.cache.size,
    '{roles}': guild.roles.cache.size,
  };

  let name = template;
  for (const [token, value] of Object.entries(replacements)) {
    name = name.replaceAll(token, String(value));
  }
  return name.slice(0, 100);
}

async function updateStatsChannels(client, guild) {
  const config = await getConfig(guild.id);
  if (!config?.enabled || !config.channels?.length) return;

  for (const channelDef of config.channels) {
    const channel = guild.channels.cache.get(channelDef.channelId);
    if (!channel) continue;

    let newName;
    if (channelDef.type === 'custom') {
      newName = buildChannelName(channelDef.template || 'Stat', guild);
    } else {
      const templates = {
        members: `Members: {members}`,
        online: `Online: {online}`,
        bots: `Bots: {bots}`,
        boosts: `Boosts: {boosts}`,
        channels: `Channels: {channels}`,
        roles: `Roles: {roles}`,
      };
      newName = buildChannelName(channelDef.template || templates[channelDef.type] || 'Stat', guild);
    }

    if (channel.name === newName) continue;

    await channel.setName(newName).catch((err) => {
      // Rate limited or permissions error — not fatal
      if (err.code !== 50013) console.error('[Stats] Channel rename error:', err.message);
    });

    // Update lastValue in DB (fire-and-forget)
    StatsConfig.updateOne(
      { guildId: guild.id, 'channels.channelId': channelDef.channelId },
      { $set: { 'channels.$.lastValue': newName } }
    ).catch(() => null);
  }
}

async function updateAllGuilds(client) {
  const configs = await StatsConfig.find({ enabled: true }).select('guildId').lean();
  for (const { guildId } of configs) {
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      await updateStatsChannels(client, guild).catch((err) => {
        console.error(`[Stats] Update error for guild ${guildId}:`, err.message);
      });
    }
  }
}

module.exports = { updateStatsChannels, updateAllGuilds, invalidateCache };

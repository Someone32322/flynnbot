/**
 * Starboard handler for the bot.
 * Handles star reactions — posts/updates/removes starboard entries.
 */
const { EmbedBuilder } = require('discord.js');
const { StarboardConfig } = require('../models/StarboardConfig');
const { StarboardEntry } = require('../models/StarboardEntry');

const configCache = new Map();
const CONFIG_TTL = 30_000;

async function getConfig(guildId) {
  const cached = configCache.get(guildId);
  if (cached && Date.now() - cached.at < CONFIG_TTL) return cached.config;
  const config = await StarboardConfig.findOne({ guildId }).lean();
  configCache.set(guildId, { config, at: Date.now() });
  return config;
}

function invalidateCache(guildId) {
  configCache.delete(guildId);
}

function emojiMatches(configEmoji, reactionEmoji) {
  if (configEmoji === reactionEmoji.name) return true;
  if (configEmoji === reactionEmoji.toString()) return true;
  if (configEmoji.includes(':') && reactionEmoji.id) {
    // custom emoji: config stores '<:name:id>' or just 'name'
    const nameMatch = configEmoji.replace(/<a?:([^:]+):\d+>/, '$1') === reactionEmoji.name;
    return nameMatch;
  }
  return false;
}

function buildStarboardEmbed(message, starCount, emoji) {
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
    .setDescription(message.content || null)
    .addFields({ name: 'Source', value: `[Jump to message](${message.url})`, inline: true })
    .setFooter({ text: `${emoji} ${starCount} stars • #${message.channel.name}` })
    .setTimestamp(message.createdAt);

  // Attach first image attachment if present
  const img = message.attachments.find((a) => a.contentType?.startsWith('image/'));
  if (img) embed.setImage(img.url);

  // Also check embeds on the original message
  const originalEmbed = message.embeds[0];
  if (!img && originalEmbed?.image) embed.setImage(originalEmbed.image.url);
  if (!img && originalEmbed?.thumbnail) embed.setThumbnail(originalEmbed.thumbnail.url);

  return embed;
}

async function handleStarReaction(reaction, user, isAdd) {
  const guild = reaction.message.guild;
  if (!guild) return;

  const config = await getConfig(guild.id);
  if (!config?.enabled || !config.channelId) return;

  // Check if this is the configured star emoji
  if (!emojiMatches(config.emoji, reaction.emoji)) return;

  // Ignore if reaction is in starboard channel itself
  if (reaction.message.channelId === config.channelId) return;

  // Ignore NSFW channels if configured
  if (config.ignoreNsfw && reaction.message.channel.nsfw) return;

  // Ignore if in ignored channels
  if (config.ignoredChannels.includes(reaction.message.channelId)) return;

  // Get real star count (respecting ignoreSelfStars)
  await reaction.fetch().catch(() => null);
  let starCount = reaction.count || 0;
  if (config.ignoreSelfStars) {
    const reactors = await reaction.users.fetch().catch(() => new Map());
    if (reactors.has(reaction.message.author?.id)) starCount -= 1;
  }

  const starboardChannel = guild.channels.cache.get(config.channelId);
  if (!starboardChannel) return;

  // Find or create starboard entry
  let entry = await StarboardEntry.findOne({
    guildId: guild.id,
    sourceMessageId: reaction.message.id,
  });

  if (!entry) {
    if (!isAdd || starCount < config.threshold) return;
    entry = new StarboardEntry({
      guildId: guild.id,
      sourceMessageId: reaction.message.id,
      sourceChannelId: reaction.message.channelId,
      authorId: reaction.message.author?.id || 'unknown',
      starCount,
      content: reaction.message.content?.slice(0, 1024) || '',
      imageUrl: reaction.message.attachments.first()?.url || null,
    });
  } else {
    entry.starCount = starCount;
  }

  const embed = buildStarboardEmbed(reaction.message, starCount, config.emoji);

  if (starCount < config.threshold) {
    // Remove from starboard if it falls below threshold
    if (entry.starboardMessageId) {
      const sbMsg = await starboardChannel.messages.fetch(entry.starboardMessageId).catch(() => null);
      if (sbMsg) await sbMsg.delete().catch(() => null);
      entry.starboardMessageId = null;
    }
    if (entry._id) await entry.deleteOne().catch(() => null);
    return;
  }

  if (entry.starboardMessageId) {
    // Update existing starboard message
    const sbMsg = await starboardChannel.messages.fetch(entry.starboardMessageId).catch(() => null);
    if (sbMsg) {
      await sbMsg.edit({ embeds: [embed] }).catch(() => null);
    } else {
      // Message was deleted, post a new one
      const newMsg = await starboardChannel.send({ embeds: [embed] }).catch(() => null);
      if (newMsg) entry.starboardMessageId = newMsg.id;
    }
  } else {
    // Post new starboard message
    const newMsg = await starboardChannel.send({ embeds: [embed] }).catch(() => null);
    if (newMsg) entry.starboardMessageId = newMsg.id;
  }

  await entry.save().catch(() => null);
}

module.exports = { handleStarReaction, invalidateCache };

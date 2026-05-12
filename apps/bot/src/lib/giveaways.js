/**
 * Giveaway handler for the bot.
 */
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { Giveaway } = require('../models/Giveaway');

const MS_UNITS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

function parseDuration(str) {
  const match = String(str).match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  return parseInt(match[1]) * (MS_UNITS[match[2].toLowerCase()] || 0);
}

function formatDuration(ms) {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

function formatDate(date) {
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:R>`;
}

function buildGiveawayEmbed(giveaway, status = 'active') {
  const embed = new EmbedBuilder()
    .setColor(status === 'active' ? 0x5865f2 : 0x6d6d6d)
    .setTitle(`🎉 ${giveaway.prize}`)
    .setFooter({ text: `${giveaway.winnerCount} winner(s) • Giveaway ID: ${giveaway._id.toString().slice(-6)}` })
    .setTimestamp();

  if (status === 'active') {
    embed.setDescription(
      [
        giveaway.description || '',
        '',
        `**Ends:** ${formatDate(giveaway.endsAt)}`,
        `**Hosted by:** <@${giveaway.hostedBy}>`,
        giveaway.requiredRoles.length ? `**Required roles:** ${giveaway.requiredRoles.map((r) => `<@&${r}>`).join(', ')}` : '',
        '',
        `Click 🎉 to enter!`,
      ].filter((l) => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim()
    );
  } else {
    const winners = giveaway.winners.length
      ? giveaway.winners.map((w) => `<@${w}>`).join(', ')
      : 'No valid entries';
    embed.setDescription(
      [
        `**Prize:** ${giveaway.prize}`,
        `**Winner(s):** ${winners}`,
        `**Hosted by:** <@${giveaway.hostedBy}>`,
        giveaway.description || '',
      ].filter(Boolean).join('\n')
    );
    embed.setTitle(`🎊 Giveaway Ended — ${giveaway.prize}`);
  }

  return embed;
}

function buildGiveawayRow(ended = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('giveaway:enter')
      .setLabel(ended ? 'Ended' : 'Enter')
      .setEmoji('🎉')
      .setStyle(ended ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(ended)
  );
}

async function createGiveaway(guild, options) {
  const { channelId, prize, winnerCount, hostedBy, durationMs, requiredRoles, bonusEntries, description } = options;

  const channel = guild.channels.cache.get(channelId);
  if (!channel) throw new Error('Channel not found');

  const endsAt = new Date(Date.now() + durationMs);
  const giveaway = new Giveaway({
    guildId: guild.id,
    channelId,
    prize,
    winnerCount: winnerCount || 1,
    hostedBy,
    endsAt,
    requiredRoles: requiredRoles || [],
    bonusEntries: bonusEntries || [],
    description: description || '',
  });

  const msg = await channel.send({
    embeds: [buildGiveawayEmbed(giveaway, 'active')],
    components: [buildGiveawayRow(false)],
  });

  giveaway.messageId = msg.id;
  await giveaway.save();
  return giveaway;
}

async function endGiveaway(client, giveaway, reroll = false) {
  if (!giveaway || (giveaway.status === 'ended' && !reroll)) return;

  const guild = client.guilds.cache.get(giveaway.guildId);
  if (!guild) return;

  const channel = guild.channels.cache.get(giveaway.channelId);
  if (!channel) return;

  // Build weighted entries
  let entries = [...giveaway.entries];
  for (const bonus of giveaway.bonusEntries || []) {
    const membersWithRole = guild.members.cache.filter((m) => m.roles.cache.has(bonus.roleId));
    for (const [memberId] of membersWithRole) {
      if (giveaway.entries.includes(memberId)) {
        for (let i = 0; i < (bonus.bonus || 1); i++) entries.push(memberId);
      }
    }
  }

  // Filter by required roles
  if (giveaway.requiredRoles.length) {
    entries = entries.filter((uid) => {
      const member = guild.members.cache.get(uid);
      return member && giveaway.requiredRoles.every((roleId) => member.roles.cache.has(roleId));
    });
  }

  // Pick winners (no duplicates)
  const winners = [];
  const pool = [...entries];
  const needed = Math.min(giveaway.winnerCount, pool.length);
  for (let i = 0; i < needed; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const winner = pool.splice(idx, 1)[0];
    if (!winners.includes(winner)) winners.push(winner);
  }

  giveaway.winners = winners;
  giveaway.status = 'ended';
  giveaway.endedAt = new Date();
  await Giveaway.findByIdAndUpdate(giveaway._id, {
    winners,
    status: 'ended',
    endedAt: giveaway.endedAt,
  }).catch(() => null);

  const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  if (msg) {
    await msg.edit({
      embeds: [buildGiveawayEmbed(giveaway, 'ended')],
      components: [buildGiveawayRow(true)],
    }).catch(() => null);
  }

  const winnerText = winners.length
    ? `🎊 Congratulations ${winners.map((w) => `<@${w}>`).join(', ')}! You won **${giveaway.prize}**!`
    : '😢 No valid entries — no winner selected.';

  await channel.send({ content: winnerText, reply: msg ? { messageReference: msg.id } : undefined }).catch(() => null);
}

async function handleGiveawayButton(interaction) {
  if (!interaction.customId.startsWith('giveaway:')) return;
  const action = interaction.customId.split(':')[1];

  if (action === 'enter') {
    const giveaway = await Giveaway.findOne({
      guildId: interaction.guildId,
      messageId: interaction.message.id,
      status: 'active',
    });

    if (!giveaway) {
      return interaction.reply({ content: 'This giveaway has ended.', ephemeral: true });
    }

    if (Date.now() > giveaway.endsAt.getTime()) {
      return interaction.reply({ content: 'This giveaway has already ended.', ephemeral: true });
    }

    // Check required roles
    if (giveaway.requiredRoles.length) {
      const member = interaction.member;
      const hasAll = giveaway.requiredRoles.every((r) => member.roles.cache.has(r));
      if (!hasAll) {
        return interaction.reply({ content: `You need the required roles to enter this giveaway.`, ephemeral: true });
      }
    }

    if (giveaway.entries.includes(interaction.user.id)) {
      // Already entered — allow leaving
      await Giveaway.findByIdAndUpdate(giveaway._id, {
        $pull: { entries: interaction.user.id },
      });
      return interaction.reply({ content: '✅ You have left the giveaway.', ephemeral: true });
    }

    await Giveaway.findByIdAndUpdate(giveaway._id, {
      $addToSet: { entries: interaction.user.id },
    });
    return interaction.reply({ content: '🎉 You have entered the giveaway! Click again to leave.', ephemeral: true });
  }
}

async function checkGiveaways(client) {
  const due = await Giveaway.find({ status: 'active', endsAt: { $lte: new Date() } }).limit(20);
  for (const giveaway of due) {
    await endGiveaway(client, giveaway).catch((err) => {
      console.error('[Giveaway] End error:', err.message);
    });
  }
}

module.exports = { createGiveaway, endGiveaway, handleGiveawayButton, checkGiveaways, parseDuration };

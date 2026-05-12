/**
 * Poll handler for the bot.
 */
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { Poll } = require('../models/Poll');

const OPTION_EMOJIS = ['🇦', '🇧', '🇨', '🇩', '🇪', '🇫', '🇬', '🇭', '🇮', '🇯'];

function buildBar(fraction) {
  const filled = Math.round(fraction * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function buildPollEmbed(poll, ended = false) {
  const totalVotes = poll.type === 'yesno'
    ? (poll.options[0]?.votes?.length || 0) + (poll.options[1]?.votes?.length || 0)
    : poll.options.reduce((s, o) => s + (o.votes?.length || 0), 0);

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${poll.question}`)
    .setColor(ended ? 0x6d6d6d : 0x5865f2)
    .setFooter({ text: ended ? `Poll ended • ${totalVotes} total votes` : `${totalVotes} total votes • Click to vote` });

  const optionLines = poll.options.map((opt, i) => {
    const votes = opt.votes?.length || 0;
    const fraction = totalVotes > 0 ? votes / totalVotes : 0;
    const emoji = poll.type === 'yesno' ? (i === 0 ? '👍' : '👎') : (OPTION_EMOJIS[i] || `${i + 1}.`);
    return `${emoji} **${opt.text}** — ${votes} vote(s) (${Math.round(fraction * 100)}%)\n${buildBar(fraction)}`;
  });

  embed.setDescription(optionLines.join('\n\n') || 'No options.');

  if (poll.endsAt && !ended) {
    embed.addFields({ name: 'Ends', value: `<t:${Math.floor(new Date(poll.endsAt).getTime() / 1000)}:R>`, inline: true });
  }

  return embed;
}

function buildPollComponents(poll, ended = false) {
  if (ended) return [];

  const rows = [];
  const buttons = poll.options.map((opt, i) => {
    const emoji = poll.type === 'yesno' ? (i === 0 ? '👍' : '👎') : (OPTION_EMOJIS[i] || `${i + 1}`);
    return new ButtonBuilder()
      .setCustomId(`poll:vote:${opt.id}`)
      .setLabel(opt.text.slice(0, 40))
      .setEmoji(emoji)
      .setStyle(i % 2 === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(ended);
  });

  // Discord limits 5 buttons per row, 5 rows max
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  return rows.slice(0, 5);
}

async function handlePollButton(interaction) {
  if (!interaction.customId.startsWith('poll:vote:')) return;
  const optionId = interaction.customId.split(':')[2];

  const poll = await Poll.findOne({
    guildId: interaction.guildId,
    messageId: interaction.message.id,
    status: 'active',
  });

  if (!poll) {
    return interaction.reply({ content: 'This poll has ended.', ephemeral: true });
  }

  if (poll.endsAt && Date.now() > poll.endsAt.getTime()) {
    return interaction.reply({ content: 'This poll has already ended.', ephemeral: true });
  }

  const option = poll.options.find((o) => o.id === optionId);
  if (!option) {
    return interaction.reply({ content: 'Invalid option.', ephemeral: true });
  }

  const userId = interaction.user.id;

  // Remove previous vote from all options if not anonymous
  for (const opt of poll.options) {
    const idx = opt.votes.indexOf(userId);
    if (idx !== -1) {
      if (opt.id === optionId) {
        // Un-voting same option
        opt.votes.splice(idx, 1);
        await poll.save();
        const embed = buildPollEmbed(poll);
        const components = buildPollComponents(poll);
        await interaction.update({ embeds: [embed], components }).catch(() => null);
        return interaction.followUp({ content: '✅ Your vote was removed.', ephemeral: true }).catch(() => null);
      }
      opt.votes.splice(idx, 1);
    }
  }

  option.votes.push(userId);
  await poll.save();

  const embed = buildPollEmbed(poll);
  const components = buildPollComponents(poll);
  await interaction.update({ embeds: [embed], components }).catch(() => null);
  return interaction.followUp({ content: `✅ You voted for **${option.text}**.`, ephemeral: true }).catch(() => null);
}

async function endPoll(client, poll) {
  if (poll.status === 'ended') return;

  const guild = client.guilds.cache.get(poll.guildId);
  if (!guild) return;

  const channel = guild.channels.cache.get(poll.channelId);
  if (!channel) return;

  await Poll.findByIdAndUpdate(poll._id, { status: 'ended', endedAt: new Date() });
  poll.status = 'ended';

  const msg = await channel.messages.fetch(poll.messageId).catch(() => null);
  if (msg) {
    await msg.edit({
      embeds: [buildPollEmbed(poll, true)],
      components: [],
    }).catch(() => null);
  }
}

async function checkPolls(client) {
  const due = await Poll.find({ status: 'active', endsAt: { $lte: new Date() } }).limit(20);
  for (const poll of due) {
    await endPoll(client, poll).catch((err) => {
      console.error('[Poll] End error:', err.message);
    });
  }
}

module.exports = { buildPollEmbed, buildPollComponents, handlePollButton, endPoll, checkPolls };

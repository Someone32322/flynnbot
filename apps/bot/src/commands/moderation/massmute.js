const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModeratorAccess, buildSapphireEmbed, ephemeral, createModerationCase, parseDurationOption, formatDuration } = require('../../lib/moderation');

function parseUserIds(input) {
  return [...new Set(input.match(/\d{17,20}/g) ?? [])];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('massmute')
    .setDescription('Timeout (mute) multiple members at once.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption((o) =>
      o.setName('user-ids').setDescription('Space or comma-separated user IDs').setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('duration').setDescription('Duration (e.g. 1h, 30m, 1d — max 28d)')
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason for mute')
    ),

  async execute(interaction) {
    const guard = await requireModeratorAccess(interaction);
    if (!guard) return;

    const rawIds = interaction.options.getString('user-ids', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided.';
    const ids = parseUserIds(rawIds);

    if (ids.length === 0) return interaction.reply(ephemeral('No valid user IDs found.'));
    if (ids.length > 50) return interaction.reply(ephemeral('You can mass-mute a maximum of 50 users at once.'));

    const durationMs = parseDurationOption(interaction, 'duration') ?? 30 * 60 * 1000;
    const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
    if (durationMs > MAX_TIMEOUT_MS) {
      return interaction.reply(ephemeral('Duration cannot exceed 28 days.'));
    }

    await interaction.deferReply();

    const results = { success: [], failed: [] };
    const untilDate = new Date(Date.now() + durationMs);

    for (const id of ids) {
      try {
        const member = await interaction.guild.members.fetch(id).catch(() => null);
        if (!member) { results.failed.push(id); continue; }
        await member.timeout(durationMs, `[Mass Mute] ${reason} — By ${interaction.user.tag}`);
        await createModerationCase({
          guild: interaction.guild,
          moderator: interaction.user,
          targetUser: member.user,
          type: 'mute',
          reason,
          durationMs,
          active: true,
        }).catch(() => null);
        results.success.push(id);
      } catch {
        results.failed.push(id);
      }
    }

    const embed = buildSapphireEmbed({
      title: 'Mass Mute Complete',
      fields: [
        { name: '✅ Muted', value: results.success.length ? results.success.map((id) => `\`${id}\``).join(', ').slice(0, 1024) : 'None' },
        { name: '❌ Failed', value: results.failed.length ? results.failed.map((id) => `\`${id}\``).join(', ').slice(0, 1024) : 'None' },
        { name: 'Duration', value: formatDuration(durationMs), inline: true },
        { name: 'Reason', value: reason },
        { name: 'Requested By', value: interaction.user.tag, inline: true },
      ],
      timestamp: true,
    });

    await interaction.editReply({ embeds: [embed] });
  },
};

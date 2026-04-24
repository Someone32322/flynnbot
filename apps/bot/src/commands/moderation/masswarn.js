const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModeratorAccess, buildSapphireEmbed, ephemeral, createModerationCase } = require('../../lib/moderation');

function parseUserIds(input) {
  return [...new Set(input.match(/\d{17,20}/g) ?? [])];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('masswarn')
    .setDescription('Warn multiple members at once.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption((o) =>
      o.setName('user-ids').setDescription('Space or comma-separated user IDs').setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason for warn')
    ),

  async execute(interaction) {
    const guard = await requireModeratorAccess(interaction);
    if (!guard) return;

    const rawIds = interaction.options.getString('user-ids', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided.';
    const ids = parseUserIds(rawIds);

    if (ids.length === 0) return interaction.reply(ephemeral('No valid user IDs found.'));
    if (ids.length > 50) return interaction.reply(ephemeral('You can mass-warn a maximum of 50 users at once.'));

    await interaction.deferReply();

    const results = { success: [], failed: [] };

    for (const id of ids) {
      try {
        const user = await interaction.client.users.fetch(id).catch(() => null);
        await createModerationCase({
          guild: interaction.guild,
          moderator: interaction.user,
          targetUser: user ?? { id, tag: id },
          type: 'warn',
          reason,
        });
        results.success.push(id);
      } catch {
        results.failed.push(id);
      }
    }

    const embed = buildSapphireEmbed({
      title: 'Mass Warn Complete',
      fields: [
        { name: '✅ Warned', value: results.success.length ? results.success.map((id) => `\`${id}\``).join(', ').slice(0, 1024) : 'None' },
        { name: '❌ Failed', value: results.failed.length ? results.failed.map((id) => `\`${id}\``).join(', ').slice(0, 1024) : 'None' },
        { name: 'Reason', value: reason },
        { name: 'Requested By', value: interaction.user.tag, inline: true },
      ],
      timestamp: true,
    });

    await interaction.editReply({ embeds: [embed] });
  },
};

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModeratorAccess, buildSapphireEmbed, ephemeral, createModerationCase } = require('../../lib/moderation');

function parseUserIds(input) {
  return [...new Set(input.match(/\d{17,20}/g) ?? [])];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('masskick')
    .setDescription('Kick multiple members at once by providing their IDs.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addStringOption((o) =>
      o.setName('user-ids').setDescription('Space or comma-separated user IDs').setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason for kick')
    ),

  async execute(interaction) {
    const guard = await requireModeratorAccess(interaction);
    if (!guard) return;

    if (!interaction.memberPermissions.has(PermissionFlagsBits.KickMembers)) {
      return interaction.reply(ephemeral('You need the **Kick Members** permission to use this command.'));
    }

    const rawIds = interaction.options.getString('user-ids', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided.';
    const ids = parseUserIds(rawIds);

    if (ids.length === 0) {
      return interaction.reply(ephemeral('No valid user IDs found in your input.'));
    }

    if (ids.length > 100) {
      return interaction.reply(ephemeral('You can mass-kick a maximum of 100 users at once.'));
    }

    await interaction.deferReply();

    const results = { success: [], failed: [] };

    for (const id of ids) {
      try {
        const member = await interaction.guild.members.fetch(id).catch(() => null);
        if (!member) { results.failed.push(id); continue; }
        await member.kick(`[Mass Kick] ${reason} — By ${interaction.user.tag}`);
        await createModerationCase({
          guild: interaction.guild,
          moderator: interaction.user,
          targetUser: member.user,
          type: 'kick',
          reason,
        }).catch(() => null);
        results.success.push(id);
      } catch {
        results.failed.push(id);
      }
    }

    const embed = buildSapphireEmbed({
      title: 'Mass Kick Complete',
      fields: [
        { name: '✅ Kicked', value: results.success.length ? results.success.map((id) => `\`${id}\``).join(', ').slice(0, 1024) : 'None' },
        { name: '❌ Failed', value: results.failed.length ? results.failed.map((id) => `\`${id}\``).join(', ').slice(0, 1024) : 'None' },
        { name: 'Reason', value: reason },
        { name: 'Requested By', value: interaction.user.tag, inline: true },
      ],
      timestamp: true,
    });

    await interaction.editReply({ embeds: [embed] });
  },
};

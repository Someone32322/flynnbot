const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModeratorAccess, buildSapphireEmbed, ephemeral, createModerationCase, logCaseToAudit } = require('../../lib/moderation');

const SAPPHIRE = 0x0f52ba;

// Parse space-separated user IDs or mentions
function parseUserIds(input) {
  return [...new Set(input.match(/\d{17,20}/g) ?? [])];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('massban')
    .setDescription('Ban multiple users at once by providing their IDs.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) =>
      o.setName('user-ids').setDescription('Space or comma-separated user IDs').setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason for ban')
    )
    .addIntegerOption((o) =>
      o.setName('delete-days').setDescription('Days of messages to delete (0-7, default 0)').setMinValue(0).setMaxValue(7)
    ),

  async execute(interaction) {
    const guard = await requireModeratorAccess(interaction);
    if (!guard) return;

    if (!interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply(ephemeral('You need the **Ban Members** permission to use this command.'));
    }

    const rawIds = interaction.options.getString('user-ids', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided.';
    const deleteDays = interaction.options.getInteger('delete-days') ?? 0;
    const ids = parseUserIds(rawIds);

    if (ids.length === 0) {
      return interaction.reply(ephemeral('No valid user IDs found in your input.'));
    }

    if (ids.length > 100) {
      return interaction.reply(ephemeral('You can mass-ban a maximum of 100 users at once.'));
    }

    await interaction.deferReply();

    const results = { success: [], failed: [] };

    for (const id of ids) {
      try {
        await interaction.guild.members.ban(id, {
          reason: `[Mass Ban] ${reason} — By ${interaction.user.tag}`,
          deleteMessageSeconds: deleteDays * 86400,
        });
        await createModerationCase({
          guild: interaction.guild,
          moderator: interaction.user,
          targetUser: { id, tag: id },
          type: 'ban',
          reason,
        }).catch(() => null);
        results.success.push(id);
      } catch {
        results.failed.push(id);
      }
    }

    const embed = buildSapphireEmbed({
      title: 'Mass Ban Complete',
      fields: [
        { name: '✅ Banned', value: results.success.length ? results.success.map((id) => `\`${id}\``).join(', ').slice(0, 1024) : 'None', inline: false },
        { name: '❌ Failed', value: results.failed.length ? results.failed.map((id) => `\`${id}\``).join(', ').slice(0, 1024) : 'None', inline: false },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Requested By', value: `${interaction.user.tag}`, inline: true },
      ],
      timestamp: true,
    });

    await interaction.editReply({ embeds: [embed] });
  },
};

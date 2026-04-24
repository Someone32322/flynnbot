const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModeratorAccess, buildSapphireEmbed, ephemeral } = require('../../lib/moderation');
const { MessageArchive } = require('../../models/MessageArchive');

const PAGE_SIZE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('message-histories')
    .setDescription('List all message archives created in this server.')
    .addIntegerOption((o) => o.setName('page').setDescription('Page number').setMinValue(1)),

  async execute(interaction) {
    const guard = await requireModeratorAccess(interaction);
    if (!guard) return;

    const page = (interaction.options.getInteger('page') ?? 1) - 1;

    const total = await MessageArchive.countDocuments({ guildId: interaction.guildId });
    if (total === 0) {
      return interaction.reply(ephemeral('No archives found for this server.'));
    }

    const archives = await MessageArchive.find({ guildId: interaction.guildId })
      .sort({ createdAt: -1 })
      .skip(page * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean();

    const rows = archives.map((a) => {
      const ts = `<t:${Math.floor(new Date(a.createdAt).getTime() / 1000)}:d>`;
      return `\`${a.archiveId}\` · **${a.targetType}** \`${a.targetName ?? a.targetId}\` · ${a.messageCount} msgs · ${ts}`;
    });

    const embed = buildSapphireEmbed({
      title: `Message Archives — Page ${page + 1}/${Math.ceil(total / PAGE_SIZE)}`,
      description: rows.join('\n'),
      fields: [{ name: 'Total Archives', value: String(total), inline: true }],
      timestamp: true,
    });

    await interaction.reply({ embeds: [embed] });
  },
};

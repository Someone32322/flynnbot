const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModeratorAccess, buildSapphireEmbed, ephemeral } = require('../../lib/moderation');
const { ModerationCase } = require('../../models/ModerationCase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('casedelete')
    .setDescription('Permanently delete a moderation case.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) =>
      o.setName('case-id').setDescription('The case ID to delete').setRequired(true)
    ),

  async execute(interaction) {
    const guard = await requireModeratorAccess(interaction);
    if (!guard) return;

    const caseId = interaction.options.getString('case-id', true);

    const caseDoc = await ModerationCase.findOneAndDelete({
      guildId: interaction.guildId,
      caseNumber: caseId,
    });

    if (!caseDoc) {
      return interaction.reply(ephemeral(`No case with ID \`${caseId}\` found in this server.`));
    }

    const embed = buildSapphireEmbed({
      title: `Case \`${caseDoc.caseNumber}\` Deleted`,
      fields: [
        { name: 'Target', value: `<@${caseDoc.targetUserId}> \`(${caseDoc.targetUserId})\``, inline: true },
        { name: 'Action', value: caseDoc.type, inline: true },
        { name: 'Deleted By', value: `${interaction.user.tag}`, inline: true },
      ],
      timestamp: true,
    });

    await interaction.reply({ embeds: [embed] });
  },
};

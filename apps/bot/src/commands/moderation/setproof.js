const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { randomUUID } = require('node:crypto');
const { requireModeratorAccess, buildSapphireEmbed, ephemeral } = require('../../lib/moderation');
const { ModerationCase } = require('../../models/ModerationCase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setproof')
    .setDescription('Add, edit, or delete proof on a moderation case.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a proof entry to a case.')
        .addStringOption((o) => o.setName('case-id').setDescription('Case ID').setRequired(true))
        .addStringOption((o) => o.setName('value').setDescription('URL or text for proof').setRequired(true).setMaxLength(500))
        .addStringOption((o) =>
          o.setName('type').setDescription('Proof type').setRequired(false)
            .addChoices(
              { name: 'Link (URL)', value: 'link' },
              { name: 'Attachment (URL)', value: 'attachment' },
              { name: 'Text', value: 'text' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a proof entry from a case.')
        .addStringOption((o) => o.setName('case-id').setDescription('Case ID').setRequired(true))
        .addStringOption((o) => o.setName('proof-id').setDescription('Proof ID to delete').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('Edit an existing proof entry on a case.')
        .addStringOption((o) => o.setName('case-id').setDescription('Case ID').setRequired(true))
        .addStringOption((o) => o.setName('proof-id').setDescription('Proof ID to edit').setRequired(true))
        .addStringOption((o) => o.setName('value').setDescription('New proof value').setRequired(true).setMaxLength(500))
    ),

  async execute(interaction) {
    const guard = await requireModeratorAccess(interaction);
    if (!guard) return;

    const sub = interaction.options.getSubcommand();
    const caseId = interaction.options.getString('case-id', true);

    const caseDoc = await ModerationCase.findOne({ guildId: interaction.guildId, caseNumber: caseId });
    if (!caseDoc) {
      return interaction.reply(ephemeral(`No case with ID \`${caseId}\` found.`));
    }

    if (sub === 'add') {
      const value = interaction.options.getString('value', true);
      const type = interaction.options.getString('type') ?? 'link';
      const proofId = randomUUID().split('-')[0].toUpperCase();

      caseDoc.proof = caseDoc.proof ?? [];
      caseDoc.proof.push({
        proofId,
        type,
        value,
        addedById: interaction.user.id,
        addedByTag: interaction.user.tag,
        addedAt: new Date(),
      });
      await caseDoc.save();

      const embed = buildSapphireEmbed({
        title: `Proof Added to Case \`${caseId}\``,
        fields: [
          { name: 'Proof ID', value: `\`${proofId}\``, inline: true },
          { name: 'Type', value: type, inline: true },
          { name: 'Value', value: value.slice(0, 512), inline: false },
          { name: 'Added By', value: interaction.user.tag, inline: true },
        ],
        timestamp: true,
      });
      return interaction.reply({ embeds: [embed] });
    }

    const proofId = interaction.options.getString('proof-id', true).toUpperCase();
    const idx = (caseDoc.proof ?? []).findIndex((p) => p.proofId === proofId);
    if (idx === -1) {
      return interaction.reply(ephemeral(`No proof entry with ID \`${proofId}\` on case \`${caseId}\`.`));
    }

    if (sub === 'delete') {
      caseDoc.proof.splice(idx, 1);
      await caseDoc.save();
      return interaction.reply(ephemeral(`✅ Deleted proof \`${proofId}\` from case \`${caseId}\`.`));
    }

    if (sub === 'edit') {
      const newValue = interaction.options.getString('value', true);
      caseDoc.proof[idx].value = newValue;
      await caseDoc.save();
      return interaction.reply(ephemeral(`✅ Updated proof \`${proofId}\` on case \`${caseId}\`.`));
    }
  },
};

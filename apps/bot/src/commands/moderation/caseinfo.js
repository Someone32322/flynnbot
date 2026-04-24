const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModeratorAccess, buildSapphireEmbed, ephemeral, findCase, formatDuration } = require('../../lib/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('caseinfo')
    .setDescription('View detailed information about a moderation case.')
    .addStringOption((o) =>
      o.setName('case-id').setDescription('The case ID to inspect').setRequired(true)
    ),

  async execute(interaction) {
    const guard = await requireModeratorAccess(interaction);
    if (!guard) return;

    const caseNumber = interaction.options.getString('case-id', true);

    const caseDoc = await findCase(interaction.guildId, caseNumber);

    if (!caseDoc) {
      return interaction.reply(ephemeral(`No case with ID \`${caseNumber}\` found in this server.`));
    }

    const created = `<t:${Math.floor(new Date(caseDoc.createdAt).getTime() / 1000)}:F>`;

    const fields = [
      { name: 'Case #', value: `\`${caseDoc.caseNumber}\``, inline: true },
      { name: 'Action', value: caseDoc.type, inline: true },
      { name: 'Active', value: caseDoc.active ? '✅ Yes' : '❌ No', inline: true },
      { name: 'Target', value: `<@${caseDoc.targetUserId}> \`(${caseDoc.targetUserId})\``, inline: true },
      { name: 'Moderator', value: `<@${caseDoc.moderatorId}> \`(${caseDoc.moderatorId})\``, inline: true },
      { name: 'Reason', value: caseDoc.reason || 'No reason provided.', inline: false },
      { name: 'Created', value: created, inline: true },
    ];

    if (caseDoc.durationMs) {
      fields.push({ name: 'Duration', value: formatDuration(caseDoc.durationMs), inline: true });
    }

    if (caseDoc.expiresAt) {
      fields.push({ name: 'Expires', value: `<t:${Math.floor(new Date(caseDoc.expiresAt).getTime() / 1000)}:R>`, inline: true });
    }

    if (caseDoc.removedAt) {
      const removedTs = `<t:${Math.floor(new Date(caseDoc.removedAt).getTime() / 1000)}:F>`;
      fields.push(
        { name: 'Removed At', value: removedTs, inline: true },
        { name: 'Removed By', value: caseDoc.removedById ? `<@${caseDoc.removedById}>` : 'Unknown', inline: true },
        { name: 'Remove Reason', value: caseDoc.removedReason || 'N/A', inline: true },
      );
    }

    if (caseDoc.proof?.length) {
      const proofLines = caseDoc.proof.map((p, i) => {
        const display = (p.type === 'link' || p.type === 'attachment')
          ? `[View Proof](${p.value})`
          : `\`${p.value.slice(0, 300)}\``;
        return `**${i + 1}.** \`${p.proofId}\` · ${p.type} — ${display}`;
      }).join('\n');
      fields.push({ name: `Proof (${caseDoc.proof.length})`, value: proofLines.slice(0, 1024), inline: false });
    } else {
      fields.push({ name: 'Proof', value: '*No proof attached.*', inline: false });
    }

    const embed = buildSapphireEmbed({
      title: `Case \`${caseDoc.caseNumber}\``,
      fields,
      footerText: `${caseDoc.targetTag || caseDoc.targetUserId}`,
      timestamp: true,
    });

    await interaction.reply({ embeds: [embed] });
  },
};

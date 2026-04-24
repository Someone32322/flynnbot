const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModeratorAccess, buildSapphireEmbed, ephemeral } = require('../../lib/moderation');
const { PredefinedReasons } = require('../../models/PredefinedReasons');

const VALID_ACTIONS = ['warn', 'mute', 'kick', 'ban', 'softban', 'note', 'temprole'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('predefinedreasons')
    .setDescription('Manage predefined reasons for moderation actions.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a predefined reason for an action.')
        .addStringOption((o) =>
          o.setName('action').setDescription('Moderation action').setRequired(true)
            .addChoices(...VALID_ACTIONS.map((a) => ({ name: a, value: a })))
        )
        .addStringOption((o) => o.setName('reason').setDescription('The reason text to add').setRequired(true).setMaxLength(200))
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List predefined reasons for an action.')
        .addStringOption((o) =>
          o.setName('action').setDescription('Moderation action').setRequired(true)
            .addChoices(...VALID_ACTIONS.map((a) => ({ name: a, value: a })))
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a predefined reason by its number.')
        .addStringOption((o) =>
          o.setName('action').setDescription('Moderation action').setRequired(true)
            .addChoices(...VALID_ACTIONS.map((a) => ({ name: a, value: a })))
        )
        .addIntegerOption((o) => o.setName('number').setDescription('Reason number from the list').setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('Edit an existing predefined reason.')
        .addStringOption((o) =>
          o.setName('action').setDescription('Moderation action').setRequired(true)
            .addChoices(...VALID_ACTIONS.map((a) => ({ name: a, value: a })))
        )
        .addIntegerOption((o) => o.setName('number').setDescription('Reason number from the list').setRequired(true).setMinValue(1))
        .addStringOption((o) => o.setName('new-reason').setDescription('New reason text').setRequired(true).setMaxLength(200))
    ),

  async execute(interaction) {
    const guard = await requireModeratorAccess(interaction);
    if (!guard) return;

    const sub = interaction.options.getSubcommand();
    const action = interaction.options.getString('action', true);

    const doc = await PredefinedReasons.findOneAndUpdate(
      { guildId: interaction.guildId, action },
      { $setOnInsert: { guildId: interaction.guildId, action, reasons: [] } },
      { upsert: true, returnDocument: 'after' }
    );

    if (sub === 'add') {
      const reason = interaction.options.getString('reason', true);
      if (doc.reasons.length >= 25) {
        return interaction.reply(ephemeral('You can only have up to 25 predefined reasons per action.'));
      }
      doc.reasons.push(reason);
      await doc.save();

      return interaction.reply(ephemeral(`✅ Added reason for \`${action}\`: "${reason}"`));
    }

    if (sub === 'list') {
      if (!doc.reasons.length) {
        return interaction.reply(ephemeral(`No predefined reasons for \`${action}\` yet.`));
      }
      const rows = doc.reasons.map((r, i) => `**${i + 1}.** ${r}`).join('\n');
      const embed = buildSapphireEmbed({
        title: `Predefined Reasons — ${action}`,
        description: rows.slice(0, 4096),
        timestamp: true,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const num = interaction.options.getInteger('number', true) - 1;
    if (num < 0 || num >= doc.reasons.length) {
      return interaction.reply(ephemeral(`Reason #${num + 1} does not exist. There are ${doc.reasons.length} reasons.`));
    }

    if (sub === 'delete') {
      const removed = doc.reasons.splice(num, 1)[0];
      await doc.save();
      return interaction.reply(ephemeral(`✅ Deleted reason #${num + 1}: "${removed}"`));
    }

    if (sub === 'edit') {
      const newReason = interaction.options.getString('new-reason', true);
      const old = doc.reasons[num];
      doc.reasons[num] = newReason;
      await doc.save();
      return interaction.reply(ephemeral(`✅ Updated reason #${num + 1} from "${old}" to "${newReason}"`));
    }
  },
};

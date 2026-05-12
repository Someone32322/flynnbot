const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createGiveaway, endGiveaway, parseDuration } = require('../../lib/giveaways');
const { Giveaway } = require('../../models/Giveaway');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage giveaways')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('start')
        .setDescription('Start a new giveaway')
        .addStringOption((o) => o.setName('prize').setDescription('What is being given away').setRequired(true))
        .addStringOption((o) => o.setName('duration').setDescription('Duration e.g. 1h, 30m, 2d').setRequired(true))
        .addChannelOption((o) => o.setName('channel').setDescription('Channel to post in').setRequired(true))
        .addIntegerOption((o) => o.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(20))
        .addStringOption((o) => o.setName('description').setDescription('Optional description'))
        .addRoleOption((o) => o.setName('required_role').setDescription('Role required to enter'))
    )
    .addSubcommand((sub) =>
      sub.setName('end')
        .setDescription('End a giveaway early')
        .addStringOption((o) => o.setName('message_id').setDescription('Message ID of the giveaway').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('reroll')
        .setDescription('Reroll winners for an ended giveaway')
        .addStringOption((o) => o.setName('message_id').setDescription('Message ID of the giveaway').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const prize = interaction.options.getString('prize');
      const durationStr = interaction.options.getString('duration');
      const channel = interaction.options.getChannel('channel');
      const winnerCount = interaction.options.getInteger('winners') || 1;
      const description = interaction.options.getString('description') || '';
      const requiredRole = interaction.options.getRole('required_role');

      const durationMs = parseDuration(durationStr);
      if (!durationMs) {
        return interaction.reply({ content: 'Invalid duration format. Use e.g. `1h`, `30m`, `2d`.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const giveaway = await createGiveaway(interaction.guild, {
          channelId: channel.id,
          prize,
          winnerCount,
          hostedBy: interaction.user.id,
          durationMs,
          requiredRoles: requiredRole ? [requiredRole.id] : [],
          description,
        });

        await interaction.editReply({ content: `✅ Giveaway started in <#${channel.id}>!` });
      } catch (err) {
        await interaction.editReply({ content: `❌ Failed to start giveaway: ${err.message}` });
      }
    }

    if (sub === 'end') {
      const messageId = interaction.options.getString('message_id');
      const giveaway = await Giveaway.findOne({ guildId: interaction.guildId, messageId });

      if (!giveaway) {
        return interaction.reply({ content: 'Giveaway not found.', ephemeral: true });
      }

      if (giveaway.status === 'ended') {
        return interaction.reply({ content: 'This giveaway has already ended.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      await endGiveaway(interaction.client, giveaway);
      await interaction.editReply({ content: '✅ Giveaway ended.' });
    }

    if (sub === 'reroll') {
      const messageId = interaction.options.getString('message_id');
      const giveaway = await Giveaway.findOne({ guildId: interaction.guildId, messageId });

      if (!giveaway) {
        return interaction.reply({ content: 'Giveaway not found.', ephemeral: true });
      }

      if (giveaway.status !== 'ended') {
        return interaction.reply({ content: 'Giveaway has not ended yet.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      await endGiveaway(interaction.client, giveaway, true);
      await interaction.editReply({ content: '✅ Giveaway rerolled with new winners.' });
    }
  },
};

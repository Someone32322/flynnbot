const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildPollEmbed, buildPollComponents, endPoll } = require('../../lib/polls');
const { Poll } = require('../../models/Poll');
const { randomUUID: uuidv4 } = require('crypto');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create and manage polls')
    .addSubcommand((sub) =>
      sub.setName('yesno')
        .setDescription('Create a yes/no poll')
        .addStringOption((o) => o.setName('question').setDescription('The poll question').setRequired(true))
        .addStringOption((o) => o.setName('duration').setDescription('Duration e.g. 1h, 30m, leave blank for no end'))
    )
    .addSubcommand((sub) =>
      sub.setName('choice')
        .setDescription('Create a multiple choice poll')
        .addStringOption((o) => o.setName('question').setDescription('The poll question').setRequired(true))
        .addStringOption((o) => o.setName('option1').setDescription('Choice 1').setRequired(true))
        .addStringOption((o) => o.setName('option2').setDescription('Choice 2').setRequired(true))
        .addStringOption((o) => o.setName('option3').setDescription('Choice 3'))
        .addStringOption((o) => o.setName('option4').setDescription('Choice 4'))
        .addStringOption((o) => o.setName('option5').setDescription('Choice 5'))
        .addStringOption((o) => o.setName('duration').setDescription('Duration e.g. 1h, 30m, leave blank for no end'))
    )
    .addSubcommand((sub) =>
      sub.setName('end')
        .setDescription('End an active poll')
        .addStringOption((o) => o.setName('message_id').setDescription('Message ID of the poll').setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'yesno' || sub === 'choice') {
      const question = interaction.options.getString('question');
      const durationStr = interaction.options.getString('duration');

      let endsAt = null;
      if (durationStr) {
        const match = String(durationStr).match(/^(\d+)(s|m|h|d)$/i);
        if (match) {
          const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
          endsAt = new Date(Date.now() + parseInt(match[1]) * units[match[2].toLowerCase()]);
        }
      }

      let options;
      if (sub === 'yesno') {
        options = [
          { id: uuidv4(), text: 'Yes', votes: [] },
          { id: uuidv4(), text: 'No', votes: [] },
        ];
      } else {
        options = [];
        for (let i = 1; i <= 5; i++) {
          const text = interaction.options.getString(`option${i}`);
          if (text) options.push({ id: uuidv4(), text, votes: [] });
        }
        if (options.length < 2) {
          return interaction.reply({ content: 'At least 2 options are required.', ephemeral: true });
        }
      }

      await interaction.deferReply();

      const poll = new Poll({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        question,
        type: sub,
        options,
        createdBy: interaction.user.id,
        endsAt,
        status: 'active',
        anonymous: false,
      });

      const embed = buildPollEmbed(poll);
      const components = buildPollComponents(poll);
      const msg = await interaction.editReply({ embeds: [embed], components });
      poll.messageId = msg.id;
      await poll.save();
    }

    if (sub === 'end') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'You need Manage Server to end polls.', ephemeral: true });
      }
      const messageId = interaction.options.getString('message_id');
      const poll = await Poll.findOne({ guildId: interaction.guildId, messageId });
      if (!poll) return interaction.reply({ content: 'Poll not found.', ephemeral: true });
      if (poll.status === 'ended') return interaction.reply({ content: 'Poll already ended.', ephemeral: true });
      await endPoll(interaction.client, poll);
      await interaction.reply({ content: '✅ Poll ended.', ephemeral: true });
    }
  },
};

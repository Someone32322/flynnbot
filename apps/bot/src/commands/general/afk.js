const { SlashCommandBuilder } = require('discord.js');
const { setAFK, clearAFK, getAFK } = require('../../lib/afk');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set or clear your AFK status')
    .addStringOption((o) => o.setName('reason').setDescription('Reason for being AFK (optional)')),

  async execute(interaction) {
    const reason = interaction.options.getString('reason') || 'AFK';
    const existing = await getAFK(interaction.guildId, interaction.user.id);

    if (existing) {
      await clearAFK(interaction.guildId, interaction.user.id);
      return interaction.reply({ content: '✅ Your AFK status has been cleared.', ephemeral: true });
    }

    await setAFK(interaction.guildId, interaction.user.id, reason);
    return interaction.reply({ content: `✅ You are now AFK: **${reason}**`, ephemeral: false });
  },
};

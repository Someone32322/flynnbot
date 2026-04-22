const { MessageFlags, SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Health check for the bot process."),
  async execute(interaction) {
    await interaction.reply({
      content: `Pong: ${interaction.client.ws.ping}ms`,
      flags: MessageFlags.Ephemeral,
    });
  },
};

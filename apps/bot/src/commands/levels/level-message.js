const { SlashCommandBuilder } = require("discord.js");
const { ensureManageGuild, updateLevelConfig, getLevelConfig, buildLevelEmbed } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level-message")
    .setDescription("Set or view the level-up message template.")
    .addStringOption((opt) =>
      opt
        .setName("template")
        .setDescription("Template using {user}, {level}, {server}")
        .setRequired(false)
        .setMaxLength(2000)
    ),
  async execute(interaction) {
    if (!(await ensureManageGuild(interaction))) return;

    const template = interaction.options.getString("template");
    if (template) {
      await updateLevelConfig(interaction.guildId, { levelUpMessage: template });
      await interaction.editReply({
        embeds: [buildLevelEmbed("Level-up Message Updated", template)],
      });
      return;
    }

    const cfg = await getLevelConfig(interaction.guildId);
    await interaction.editReply({
      embeds: [buildLevelEmbed("Current Level-up Message", cfg.levelUpMessage)],
    });
  },
};

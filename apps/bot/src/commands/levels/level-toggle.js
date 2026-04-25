const { SlashCommandBuilder } = require("discord.js");
const { ensureManageGuild, updateLevelConfig, buildLevelEmbed } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level-toggle")
    .setDescription("Enable or disable the leveling system.")
    .addBooleanOption((opt) => opt.setName("enabled").setDescription("On/Off").setRequired(true)),
  async execute(interaction) {
    if (!(await ensureManageGuild(interaction))) return;
    const enabled = interaction.options.getBoolean("enabled", true);
    await updateLevelConfig(interaction.guildId, { enabled });
    await interaction.editReply({
      embeds: [buildLevelEmbed("Leveling Toggled", `Leveling is now **${enabled ? "enabled" : "disabled"}**.`)],
    });
  },
};

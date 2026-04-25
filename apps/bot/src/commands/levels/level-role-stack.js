const { SlashCommandBuilder } = require("discord.js");
const { ensureManageGuild, updateLevelConfig, buildLevelEmbed } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level-role-stack")
    .setDescription("Toggle stacking level reward roles.")
    .addBooleanOption((opt) => opt.setName("enabled").setDescription("Keep all level roles?").setRequired(true)),
  async execute(interaction) {
    if (!(await ensureManageGuild(interaction))) return;
    const enabled = interaction.options.getBoolean("enabled", true);
    await updateLevelConfig(interaction.guildId, { roleStack: enabled });
    await interaction.editReply({
      embeds: [buildLevelEmbed("Role Stacking Updated", enabled ? "Members keep all earned level roles." : "Members keep only their highest level role.")],
    });
  },
};

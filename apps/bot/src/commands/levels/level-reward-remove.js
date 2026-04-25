const { SlashCommandBuilder } = require("discord.js");
const { ensureManageGuild, getLevelConfig, updateLevelConfig, buildLevelEmbed } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level-reward-remove")
    .setDescription("Remove a level role reward.")
    .addIntegerOption((opt) => opt.setName("level").setDescription("Level to remove reward from").setRequired(true).setMinValue(1)),
  async execute(interaction) {
    if (!(await ensureManageGuild(interaction))) return;

    const level = interaction.options.getInteger("level", true);
    const cfg = await getLevelConfig(interaction.guildId);
    const rewards = (cfg.rewards || []).filter((r) => r.level !== level);

    await updateLevelConfig(interaction.guildId, { rewards });
    await interaction.editReply({ embeds: [buildLevelEmbed("Level Reward Removed", `Removed reward for level **${level}**.`)] });
  },
};

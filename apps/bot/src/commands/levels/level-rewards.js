const { SlashCommandBuilder } = require("discord.js");
const { getLevelConfig, buildLevelEmbed } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder().setName("level-rewards").setDescription("List all configured level rewards."),
  async execute(interaction) {
    const cfg = await getLevelConfig(interaction.guildId);
    const rewards = (cfg.rewards || []).sort((a, b) => a.level - b.level);
    const text = rewards.length
      ? rewards.map((r) => `Level **${r.level}** -> <@&${r.roleId}>`).join("\n")
      : "No rewards configured.";

    await interaction.editReply({ embeds: [buildLevelEmbed("Level Rewards", text)] });
  },
};

const { SlashCommandBuilder } = require("discord.js");
const { ensureManageGuild, getLevelConfig, updateLevelConfig, buildLevelEmbed } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level-reward-add")
    .setDescription("Assign a role reward to a level.")
    .addIntegerOption((opt) => opt.setName("level").setDescription("Required level").setRequired(true).setMinValue(1))
    .addRoleOption((opt) => opt.setName("role").setDescription("Reward role").setRequired(true)),
  async execute(interaction) {
    if (!(await ensureManageGuild(interaction))) return;

    const level = interaction.options.getInteger("level", true);
    const role = interaction.options.getRole("role", true);
    const cfg = await getLevelConfig(interaction.guildId);

    const rewards = (cfg.rewards || []).filter((r) => r.level !== level);
    rewards.push({ level, roleId: role.id });
    rewards.sort((a, b) => a.level - b.level);

    await updateLevelConfig(interaction.guildId, { rewards });
    await interaction.editReply({ embeds: [buildLevelEmbed("Level Reward Added", `Level **${level}** now grants ${role}.`)] });
  },
};

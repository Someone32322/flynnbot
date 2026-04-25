const { SlashCommandBuilder } = require("discord.js");
const { ensureManageGuild, updateLevelConfig, buildLevelEmbed } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("xp-cooldown")
    .setDescription("Set cooldown between XP gains per user.")
    .addIntegerOption((opt) => opt.setName("seconds").setDescription("Cooldown in seconds (0-3600)").setRequired(true).setMinValue(0).setMaxValue(3600)),
  async execute(interaction) {
    if (!(await ensureManageGuild(interaction))) return;
    const seconds = interaction.options.getInteger("seconds", true);
    await updateLevelConfig(interaction.guildId, { xpCooldown: seconds });
    await interaction.editReply({ embeds: [buildLevelEmbed("XP Cooldown Updated", `Cooldown is now **${seconds}s**.`)] });
  },
};

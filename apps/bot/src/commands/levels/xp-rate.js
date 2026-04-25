const { SlashCommandBuilder } = require("discord.js");
const { ensureManageGuild, updateLevelConfig, buildLevelEmbed } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("xp-rate")
    .setDescription("Set XP earned per message.")
    .addIntegerOption((opt) => opt.setName("rate").setDescription("XP amount (1-500)").setRequired(true).setMinValue(1).setMaxValue(500)),
  async execute(interaction) {
    if (!(await ensureManageGuild(interaction))) return;
    const rate = interaction.options.getInteger("rate", true);
    await updateLevelConfig(interaction.guildId, { xpRate: rate });
    await interaction.editReply({ embeds: [buildLevelEmbed("XP Rate Updated", `Users now gain **${rate} XP** per message.`)] });
  },
};

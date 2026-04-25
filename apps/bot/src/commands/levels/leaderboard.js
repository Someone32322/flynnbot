const { SlashCommandBuilder } = require("discord.js");
const { getLevelConfig, LevelProfile, buildLevelEmbed, levelFromXp } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the server XP leaderboard.")
    .addIntegerOption((opt) =>
      opt.setName("limit").setDescription("Entries per page (10-25)").setMinValue(10).setMaxValue(25).setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName("page").setDescription("Page number").setMinValue(1).setRequired(false)
    ),
  async execute(interaction) {
    const limit = interaction.options.getInteger("limit") ?? 10;
    const page = interaction.options.getInteger("page") ?? 1;
    const cfg = await getLevelConfig(interaction.guildId);

    const docs = await LevelProfile.find({ guildId: interaction.guildId })
      .sort({ xp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    if (!docs.length) {
      await interaction.editReply({ embeds: [buildLevelEmbed("Leaderboard", "No leveling data yet.")] });
      return;
    }

    const lines = docs.map((d, idx) => {
      const level = levelFromXp(d.xp, cfg.formula);
      const rank = (page - 1) * limit + idx + 1;
      return `**#${rank}** <@${d.userId}> • Level **${level}** • **${d.xp} XP**`;
    });

    await interaction.editReply({
      embeds: [
        buildLevelEmbed(
          "XP Leaderboard",
          lines.join("\n")
        ).setFooter({ text: `Page ${page} • Limit ${limit}` }),
      ],
    });
  },
};

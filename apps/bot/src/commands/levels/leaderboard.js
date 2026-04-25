const { SlashCommandBuilder } = require("discord.js");
const {
  getLevelConfig,
  LevelProfile,
  buildLevelEmbed,
  levelFromXp,
  progressForXp,
  buildLeaderboardCard,
} = require("./_shared");

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
    const total = await LevelProfile.countDocuments({ guildId: interaction.guildId });
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const docs = await LevelProfile.find({ guildId: interaction.guildId })
      .sort({ xp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    if (!docs.length) {
      await interaction.editReply({ embeds: [buildLevelEmbed("Leaderboard", "No leveling data yet.")] });
      return;
    }

    const rows = await Promise.all(docs.map(async (d, idx) => {
      const level = levelFromXp(d.xp, cfg.formula);
      const rank = (page - 1) * limit + idx + 1;
      const progress = progressForXp(d.xp, level, cfg.formula);

      const member = await interaction.guild.members.fetch(d.userId).catch(() => null);
      const user = member?.user || null;

      return {
        rank,
        level,
        xp: d.xp,
        progressRatio: progress.ratio,
        displayName: member?.displayName || user?.username || `User ${d.userId}`,
        avatarUrl: user?.displayAvatarURL?.({ extension: "png", size: 128 }) || null,
      };
    }));

    try {
      const card = await buildLeaderboardCard(interaction.guild, rows, { page, totalPages });
      await interaction.editReply({
        embeds: [
          buildLevelEmbed(
            "XP Leaderboard",
            `Server progression snapshot for **${interaction.guild.name}**.`
          ).setImage("attachment://leaderboard-card.png"),
        ],
        files: [card],
      });
      return;
    } catch {}

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
        ).setFooter({ text: `Page ${page} / ${totalPages} • Limit ${limit}` }),
      ],
    });
  },
};

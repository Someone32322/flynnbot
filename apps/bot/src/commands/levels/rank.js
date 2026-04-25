const { SlashCommandBuilder } = require("discord.js");
const {
  getProfileAndComputed,
  progressForXp,
  progressBar,
  computeRank,
  buildRankCard,
  buildLevelEmbed,
} = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Fetch a user's XP, level, and rank in this server.")
    .addUserOption((opt) => opt.setName("user").setDescription("Target user").setRequired(false)),
  async execute(interaction) {
    const target = interaction.options.getUser("user") || interaction.user;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await interaction.editReply({ embeds: [buildLevelEmbed("Rank", "That user is not in this server.")] });
      return;
    }

    const { cfg, profile } = await getProfileAndComputed(interaction.guildId, target.id);
    const rank = await computeRank(interaction.guildId, profile.xp);
    const progress = progressForXp(profile.xp, profile.level, cfg.formula);

    try {
      const card = await buildRankCard(member, profile, cfg, rank);
      await interaction.editReply({
        embeds: [
          buildLevelEmbed(
            `${target.username}'s Rank`,
            `Level **${profile.level}** | XP **${profile.xp}** | Rank **#${rank}**\n${progressBar(progress.ratio)} ${Math.round(progress.ratio * 100)}%`
          ).setImage("attachment://rank-card.png"),
        ],
        files: [card],
      });
    } catch {
      await interaction.editReply({
        embeds: [
          buildLevelEmbed(
            `${target.username}'s Rank`,
            `Level **${profile.level}** | XP **${profile.xp}** | Rank **#${rank}**\n${progressBar(progress.ratio)} ${Math.round(progress.ratio * 100)}%`
          ),
        ],
      });
    }
  },
};

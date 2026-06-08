const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const {
  getProfileAndComputed,
  progressForXp,
  computeRank,
  buildRankCard,
  buildLevelEmbed,
  SAPPHIRE,
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
      // Clean output: canvacord card is the star — no duplicate text progress bar
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(SAPPHIRE)
            .setImage("attachment://rank-card.png")
            .setFooter({ text: "FlynnBot Levels" })
            .setTimestamp(),
        ],
        files: [card],
      });
    } catch {
      // Fallback embed when card render fails
      await interaction.editReply({
        embeds: [
          buildLevelEmbed(
            `${target.username}'s Rank`,
            `**Level** ${profile.level}  ·  **XP** ${profile.xp}  ·  **Rank** #${rank}`
          ).addFields({
            name: "Progress to next level",
            value: `${progress.within.toLocaleString()} / ${progress.span.toLocaleString()} XP (${Math.round(progress.ratio * 100)}%)`,
            inline: false,
          }),
        ],
      });
    }
  },
};

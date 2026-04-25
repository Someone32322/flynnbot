const { SlashCommandBuilder } = require("discord.js");
const {
  ensureManageGuild,
  getProfileAndComputed,
  totalXpForLevel,
  updateLevelConfig,
  applyLevelRewards,
  buildLevelEmbed,
} = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level-set")
    .setDescription("Set a user's level manually.")
    .addUserOption((opt) => opt.setName("user").setDescription("Target user").setRequired(true))
    .addIntegerOption((opt) => opt.setName("level").setDescription("Level to assign (>=0)").setRequired(true).setMinValue(0)),
  async execute(interaction) {
    if (!(await ensureManageGuild(interaction))) return;

    const user = interaction.options.getUser("user", true);
    const level = interaction.options.getInteger("level", true);

    const { cfg, profile } = await getProfileAndComputed(interaction.guildId, user.id);
    profile.level = level;
    profile.xp = totalXpForLevel(level, cfg.formula);
    await profile.save();

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) await applyLevelRewards(member, cfg, level);

    await interaction.editReply({
      embeds: [buildLevelEmbed("Level Set", `Set <@${user.id}> to level **${level}** (${profile.xp} XP).`)],
    });
  },
};

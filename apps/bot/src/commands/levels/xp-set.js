const { SlashCommandBuilder } = require("discord.js");
const { ensureManageGuild, getProfileAndComputed, levelFromXp, buildLevelEmbed, applyLevelRewards } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("xp-set")
    .setDescription("Set a user's XP directly.")
    .addUserOption((opt) => opt.setName("user").setDescription("Target user").setRequired(true))
    .addIntegerOption((opt) => opt.setName("xp").setDescription("XP value (>=0)").setRequired(true).setMinValue(0)),
  async execute(interaction) {
    if (!(await ensureManageGuild(interaction))) return;

    const user = interaction.options.getUser("user", true);
    const xp = interaction.options.getInteger("xp", true);
    const { cfg, profile } = await getProfileAndComputed(interaction.guildId, user.id);

    profile.xp = xp;
    profile.level = levelFromXp(xp, cfg.formula);
    await profile.save();

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) await applyLevelRewards(member, cfg, profile.level);

    await interaction.editReply({
      embeds: [buildLevelEmbed("XP Set", `Set <@${user.id}> to **${xp} XP** (level **${profile.level}**).`)],
    });
  },
};

const { SlashCommandBuilder } = require("discord.js");
const { ensureManageGuild, getProfileAndComputed, levelFromXp, buildLevelEmbed, applyLevelRewards } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("xp-remove")
    .setDescription("Remove XP from a user.")
    .addUserOption((opt) => opt.setName("user").setDescription("Target user").setRequired(true))
    .addIntegerOption((opt) => opt.setName("amount").setDescription("XP to remove").setRequired(true).setMinValue(1)),
  async execute(interaction) {
    if (!(await ensureManageGuild(interaction))) return;

    const user = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    const { cfg, profile } = await getProfileAndComputed(interaction.guildId, user.id);

    profile.xp = Math.max(0, profile.xp - amount);
    profile.level = levelFromXp(profile.xp, cfg.formula);
    await profile.save();

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) await applyLevelRewards(member, cfg, profile.level);

    await interaction.editReply({
      embeds: [buildLevelEmbed("XP Removed", `Removed **${amount} XP** from <@${user.id}>. Now **${profile.xp} XP** (level **${profile.level}**).`)],
    });
  },
};

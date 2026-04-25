const { SlashCommandBuilder } = require("discord.js");
const { ensureManageGuild, getProfileAndComputed, levelFromXp, buildLevelEmbed, applyLevelRewards } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("xp-add")
    .setDescription("Add XP to a user.")
    .addUserOption((opt) => opt.setName("user").setDescription("Target user").setRequired(true))
    .addIntegerOption((opt) => opt.setName("amount").setDescription("XP to add").setRequired(true).setMinValue(1)),
  async execute(interaction) {
    if (!(await ensureManageGuild(interaction))) return;

    const user = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    const { cfg, profile } = await getProfileAndComputed(interaction.guildId, user.id);

    const oldLevel = profile.level;
    profile.xp += amount;
    profile.level = levelFromXp(profile.xp, cfg.formula);
    await profile.save();

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member && profile.level > oldLevel) await applyLevelRewards(member, cfg, profile.level);

    const levelText = profile.level > oldLevel ? ` Level-up: **${oldLevel} -> ${profile.level}**.` : "";
    await interaction.editReply({
      embeds: [buildLevelEmbed("XP Added", `Added **${amount} XP** to <@${user.id}>.${levelText}`)],
    });
  },
};

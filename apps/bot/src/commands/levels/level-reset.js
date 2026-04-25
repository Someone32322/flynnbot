const { SlashCommandBuilder } = require("discord.js");
const { ensureManageGuild, getOrCreateLevelProfile, buildLevelEmbed } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level-reset")
    .setDescription("Reset a user's level and XP to zero.")
    .addUserOption((opt) => opt.setName("user").setDescription("Target user").setRequired(true))
    .addBooleanOption((opt) => opt.setName("confirm").setDescription("Must be true to confirm").setRequired(true)),
  async execute(interaction) {
    if (!(await ensureManageGuild(interaction))) return;
    const user = interaction.options.getUser("user", true);
    const confirm = interaction.options.getBoolean("confirm", true);
    if (!confirm) {
      await interaction.editReply({ embeds: [buildLevelEmbed("Reset Cancelled", "Set `confirm` to true to execute reset.")] });
      return;
    }

    const profile = await getOrCreateLevelProfile(interaction.guildId, user.id);
    profile.xp = 0;
    profile.level = 0;
    await profile.save();

    await interaction.editReply({
      embeds: [buildLevelEmbed("Level Reset", `Reset <@${user.id}> to **0 XP** and **level 0**.`)],
    });
  },
};

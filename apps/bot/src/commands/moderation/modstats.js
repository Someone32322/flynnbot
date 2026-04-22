const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const { ModerationCase } = require("../../models/ModerationCase");
const { buildSapphireEmbed, ephemeral, requireModeratorAccess } = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("modstats")
    .setDescription("Get moderation stats for a moderator or admin.")
    .addUserOption((option) => option.setName("user").setDescription("Moderator to inspect").setRequired(true)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const moderator = interaction.options.getUser("user", true);
    const cases = await ModerationCase.find({ guildId: interaction.guildId, moderatorId: moderator.id }).lean();
    if (cases.length === 0) {
      await interaction.reply(ephemeral("That moderator has no recorded cases yet."));
      return;
    }

    const totals = cases.reduce((acc, entry) => {
      acc.total += 1;
      acc.byType[entry.type] = (acc.byType[entry.type] || 0) + 1;
      if (entry.active) {
        acc.active += 1;
      }
      return acc;
    }, { total: 0, active: 0, byType: {} });

    const embed = buildSapphireEmbed({
      title: `Moderation stats for ${moderator.tag}`,
      description: `Total cases: ${totals.total}\nActive cases: ${totals.active}`,
      fields: [
        {
          name: "By Type",
          value: Object.entries(totals.byType)
            .sort((left, right) => right[1] - left[1])
            .map(([type, count]) => `${type}: ${count}`)
            .join("\n")
            .slice(0, 1024),
        },
      ],
      footerText: "Stats are generated from recorded moderation cases.",
    });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

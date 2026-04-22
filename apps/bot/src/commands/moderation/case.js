const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const { buildCaseSummary, buildSapphireEmbed, ephemeral, findCase, requireModeratorAccess } = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("case")
    .setDescription("View a moderation case by ID.")
    .addStringOption((option) => option.setName("case").setDescription("Case ID").setRequired(true)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const caseNumber = interaction.options.getString("case", true);
    const caseDocument = await findCase(interaction.guildId, caseNumber);
    if (!caseDocument) {
      await interaction.reply(ephemeral("That case was not found."));
      return;
    }

    const embed = buildSapphireEmbed({
      title: `Case \`${caseDocument.caseNumber}\``,
      description: buildCaseSummary(caseDocument),
    });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

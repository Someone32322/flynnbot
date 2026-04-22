const { SlashCommandBuilder } = require("discord.js");
const { buildStaffReply, ephemeral, findCase, getAuditColor, logCaseToAudit, requireModeratorAccess, updateCaseReason } = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reason")
    .setDescription("Update the reason on a moderation case.")
    .addStringOption((option) => option.setName("case").setDescription("Case ID").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("New reason").setRequired(true)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const caseNumber = interaction.options.getString("case", true);
    const reason = interaction.options.getString("reason", true);
    const caseDocument = await findCase(interaction.guildId, caseNumber);
    if (!caseDocument) {
      await interaction.reply(ephemeral("That case was not found."));
      return;
    }

    await updateCaseReason(caseDocument, reason);
    await logCaseToAudit(interaction.guild, guildConfig, caseDocument, [], getAuditColor("reason"));
    await interaction.reply(buildStaffReply("reason", { caseDocument }));
  },
};

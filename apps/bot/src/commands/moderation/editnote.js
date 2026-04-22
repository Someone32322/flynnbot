const { SlashCommandBuilder } = require("discord.js");
const { buildStaffReply, findCase, ephemeral, getAuditColor, logToAuditChannel, requireModeratorAccess } = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("editnote")
    .setDescription("Edit an existing moderation note.")
    .addStringOption((option) => option.setName("case").setDescription("Note case ID").setRequired(true))
    .addStringOption((option) => option.setName("text").setDescription("New note text").setRequired(true)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const caseNumber = interaction.options.getString("case", true);
    const text = interaction.options.getString("text", true);
    const caseDocument = await findCase(interaction.guildId, caseNumber);

    if (!caseDocument || caseDocument.type !== "note") {
      await interaction.reply(ephemeral("That note case was not found."));
      return;
    }

    caseDocument.reason = text;
    caseDocument.metadata.note = text;
    await caseDocument.save();

    await logToAuditChannel(
      interaction.guild,
      guildConfig,
      "Moderation note edited",
      [
        { name: "Case", value: `#${caseDocument.caseNumber}`, inline: true },
        { name: "Target", value: `<@${caseDocument.targetUserId}>`, inline: true },
        { name: "Updated By", value: `<@${interaction.user.id}>`, inline: true },
        { name: "New Text", value: text, inline: false },
      ],
      getAuditColor("editnote")
    );

    await interaction.reply(buildStaffReply("editnote", { caseDocument }));
  },
};

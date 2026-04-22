const { SlashCommandBuilder } = require("discord.js");
const {
  buildStaffReply,
  ephemeral,
  findCase,
  getAuditColor,
  logCaseToAudit,
  requireModeratorAccess,
  sendDmNotice,
} = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unwarn")
    .setDescription("Alias for /delwarn.")
    .addStringOption((option) => option.setName("case").setDescription("Warning case ID").setRequired(true))
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason for removing the warning").setRequired(false)
    ),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const caseNumber = interaction.options.getString("case", true);
    const reason = interaction.options.getString("reason") || "No reason provided.";
    const caseDocument = await findCase(interaction.guildId, caseNumber);
    if (!caseDocument || caseDocument.type !== "warn" || caseDocument.removedAt) {
      await interaction.reply(ephemeral("That active warning case was not found."));
      return;
    }

    const targetUser = await interaction.client.users.fetch(caseDocument.targetUserId).catch(() => null);
    if (targetUser) {
      await sendDmNotice(
        targetUser,
        `A warning was removed in ${interaction.guild.name}.\nCase: #${caseDocument.caseNumber}\nReason: ${reason}`
      );
    }

    caseDocument.removedAt = new Date();
    caseDocument.removedReason = reason;
    caseDocument.active = false;
    await caseDocument.save();

    await logCaseToAudit(interaction.guild, guildConfig, caseDocument, [], getAuditColor("unwarn"));
    await interaction.reply(buildStaffReply("unwarn", { caseDocument }));
  },
};

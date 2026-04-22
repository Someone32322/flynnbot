const { SlashCommandBuilder } = require("discord.js");
const { buildStaffReply, createModerationCase, ephemeral, getAuditColor, listCasesForUser, logCaseToAudit, requireModeratorAccess, resolveModerationTarget } = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clearnotes")
    .setDescription("Clear all moderation notes for a user.")
    .addUserOption((option) => option.setName("user").setDescription("User to clear notes for").setRequired(true)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const target = await resolveModerationTarget(interaction, "user", "unused_user_id");
    if (!target) {
      await interaction.reply(ephemeral("That user could not be resolved."));
      return;
    }

    const notes = (await listCasesForUser(interaction.guildId, target.targetUser.id, ["note"]))
      .filter((entry) => !entry.removedAt);

    if (notes.length === 0) {
      await interaction.reply(ephemeral("That user does not have any notes to clear."));
      return;
    }

    const caseNumbers = notes.map((entry) => entry.caseNumber);
    const { ModerationCase } = require("../../models/ModerationCase");
    await ModerationCase.updateMany(
      { guildId: interaction.guildId, caseNumber: { $in: caseNumbers } },
      { $set: { removedAt: new Date(), removedReason: `Cleared by ${interaction.user.tag}` } }
    );

    const caseDocument = await createModerationCase({
      guild: interaction.guild,
      moderator: interaction.user,
      targetUser: target.targetUser,
      type: "clearnotes",
      reason: `Cleared ${notes.length} notes`,
      metadata: { clearedCases: caseNumbers },
    });

    await logCaseToAudit(interaction.guild, guildConfig, caseDocument, [], getAuditColor("clearnotes"));
    await interaction.reply(buildStaffReply("clearnotes", { targetUser: target.targetUser, count: notes.length, caseDocument }));
  },
};

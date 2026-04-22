const { SlashCommandBuilder } = require("discord.js");
const {
  buildStaffReply,
  createModerationCase,
  ensureTargetModeratable,
  ephemeral,
  getAuditColor,
  logCaseToAudit,
  requireModeratorAccess,
  resolveModerationTarget,
} = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("note")
    .setDescription("Add a moderation note for a user.")
    .addUserOption((option) => option.setName("user").setDescription("User to note").setRequired(true))
    .addStringOption((option) => option.setName("text").setDescription("Note text").setRequired(true)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const target = await resolveModerationTarget(interaction, "user", "unused_user_id");
    if (!target || !(await ensureTargetModeratable(interaction, target.targetMember))) {
      return;
    }

    const text = interaction.options.getString("text", true);
    const caseDocument = await createModerationCase({
      guild: interaction.guild,
      moderator: interaction.user,
      targetUser: target.targetUser,
      type: "note",
      reason: text,
      metadata: { note: text },
    });

    await logCaseToAudit(interaction.guild, guildConfig, caseDocument, [], getAuditColor("note"));
    await interaction.reply(buildStaffReply("note", { targetUser: target.targetUser, caseDocument }));
  },
};

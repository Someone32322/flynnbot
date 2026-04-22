const { SlashCommandBuilder } = require("discord.js");
const {
  buildStaffReply,
  createModerationCase,
  ensureTargetModeratable,
  ephemeral,
  getAuditColor,
  logCaseToAudit,
  parseDurationOption,
  requireModeratorAccess,
  resolveModerationTarget,
  scheduleTimedAction,
} = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("temprole")
    .setDescription("Assign a temporary role to a member.")
    .addRoleOption((option) => option.setName("role").setDescription("Role to assign").setRequired(true))
    .addUserOption((option) => option.setName("user").setDescription("Target user").setRequired(true))
    .addStringOption((option) => option.setName("time").setDescription("Duration like 1h or 2d").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Reason").setRequired(false)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const role = interaction.options.getRole("role", true);
    const target = await resolveModerationTarget(interaction, "user", "unused_user_id");
    const durationMs = parseDurationOption(interaction, "time");
    const reason = interaction.options.getString("reason") || "No reason provided.";

    if (!durationMs) {
      await interaction.reply(ephemeral("Use a valid duration like 1s, 1m, 1h, 1d, or 1y."));
      return;
    }

    if (!role.editable) {
      await interaction.reply(ephemeral("The bot cannot manage that role with the current hierarchy."));
      return;
    }

    if (!target?.targetMember || !(await ensureTargetModeratable(interaction, target.targetMember))) {
      return;
    }

    await target.targetMember.roles.add(role, reason);
    const caseDocument = await createModerationCase({
      guild: interaction.guild,
      moderator: interaction.user,
      targetUser: target.targetUser,
      type: "temprole",
      reason,
      active: true,
      durationMs,
      metadata: { roleId: role.id, roleName: role.name },
    });

    await scheduleTimedAction({
      guildId: interaction.guildId,
      caseDocument,
      actionType: "remove_temprole",
      executeAt: caseDocument.expiresAt,
      targetUserId: target.targetUser.id,
      roleId: role.id,
    });

    await logCaseToAudit(interaction.guild, guildConfig, caseDocument, [], getAuditColor("temprole"));
    await interaction.reply(buildStaffReply("temprole", { targetUser: target.targetUser, caseDocument, role }));
  },
};

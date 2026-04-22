const { SlashCommandBuilder } = require("discord.js");
const { ModerationCase } = require("../../models/ModerationCase");
const {
  buildStaffReply,
  closeCase,
  ensureTargetModeratable,
  ephemeral,
  getAuditColor,
  logToAuditChannel,
  requireModeratorAccess,
  resolveModerationTarget,
} = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("removetemprole")
    .setDescription("Remove a temporary role from a user.")
    .addUserOption((option) => option.setName("user").setDescription("Target user").setRequired(true))
    .addRoleOption((option) => option.setName("role").setDescription("Role to remove").setRequired(true)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const role = interaction.options.getRole("role", true);
    const target = await resolveModerationTarget(interaction, "user", "unused_user_id");
    if (!target?.targetMember || !(await ensureTargetModeratable(interaction, target.targetMember))) {
      return;
    }

    await target.targetMember.roles.remove(role, `Manual temp role removal by ${interaction.user.tag}`).catch(() => null);
    const activeCases = await ModerationCase.find({
      guildId: interaction.guildId,
      targetUserId: target.targetUser.id,
      type: "temprole",
      active: true,
      "metadata.roleId": role.id,
    });
    for (const caseDocument of activeCases) {
      await closeCase(caseDocument, `Manual temp role removal by ${interaction.user.tag}`);
    }

    await logToAuditChannel(
      interaction.guild,
      guildConfig,
      "Temporary role removed",
      [
        { name: "Target", value: `<@${target.targetUser.id}>`, inline: true },
        { name: "Role", value: `<@&${role.id}>`, inline: true },
        { name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
      ],
      getAuditColor("removetemprole")
    );

    await interaction.reply(buildStaffReply("removetemprole", { targetUser: target.targetUser, role }));
  },
};

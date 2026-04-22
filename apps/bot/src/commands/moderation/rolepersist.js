const { SlashCommandBuilder } = require("discord.js");
const {
  addPersistentRole,
  buildStaffReply,
  createModerationCase,
  ensureTargetModeratable,
  ephemeral,
  getAuditColor,
  logCaseToAudit,
  removePersistentRole,
  requireModeratorAccess,
  resolveModerationTarget,
  togglePersistentRole,
} = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rolepersist")
    .setDescription("Assign or remove a role that persists if a member rejoins.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a persistent role to a user")
        .addUserOption((option) => option.setName("user").setDescription("Target user").setRequired(true))
        .addRoleOption((option) => option.setName("role").setDescription("Role to persist").setRequired(true))
        .addStringOption((option) => option.setName("reason").setDescription("Reason").setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a persistent role from a user")
        .addUserOption((option) => option.setName("user").setDescription("Target user").setRequired(true))
        .addRoleOption((option) => option.setName("role").setDescription("Role to remove").setRequired(true))
        .addStringOption((option) => option.setName("reason").setDescription("Reason").setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("toggle")
        .setDescription("Toggle a persistent role for a user")
        .addUserOption((option) => option.setName("user").setDescription("Target user").setRequired(true))
        .addRoleOption((option) => option.setName("role").setDescription("Role to toggle").setRequired(true))
        .addStringOption((option) => option.setName("reason").setDescription("Reason").setRequired(false))
    ),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const operation = interaction.options.getSubcommand();
    const target = await resolveModerationTarget(interaction, "user", "unused_user_id");
    const role = interaction.options.getRole("role", true);
    const reason = interaction.options.getString("reason") || "No reason provided.";

    if (!role.editable) {
      await interaction.reply(ephemeral("The bot cannot manage that role with the current hierarchy."));
      return;
    }

    if (target?.targetMember && !(await ensureTargetModeratable(interaction, target.targetMember))) {
      return;
    }

    let enabled = false;
    if (operation === "add") {
      await addPersistentRole({
        guildId: interaction.guildId,
        userId: target.targetUser.id,
        roleId: role.id,
        assignedById: interaction.user.id,
        reason,
      });
      enabled = true;
      if (target.targetMember) {
        await target.targetMember.roles.add(role, reason).catch(() => null);
      }
    }

    if (operation === "remove") {
      await removePersistentRole(interaction.guildId, target.targetUser.id, role.id);
      if (target.targetMember && target.targetMember.roles.cache.has(role.id)) {
        await target.targetMember.roles.remove(role, reason).catch(() => null);
      }
    }

    if (operation === "toggle") {
      enabled = await togglePersistentRole({
        guildId: interaction.guildId,
        userId: target.targetUser.id,
        roleId: role.id,
        assignedById: interaction.user.id,
        reason,
      });
      if (target.targetMember) {
        if (enabled) {
          await target.targetMember.roles.add(role, reason).catch(() => null);
        } else if (target.targetMember.roles.cache.has(role.id)) {
          await target.targetMember.roles.remove(role, reason).catch(() => null);
        }
      }
    }

    const caseDocument = await createModerationCase({
      guild: interaction.guild,
      moderator: interaction.user,
      targetUser: target.targetUser,
      type: "rolepersist",
      reason,
      metadata: { roleId: role.id, operation },
    });

    await logCaseToAudit(interaction.guild, guildConfig, caseDocument, [], getAuditColor("rolepersist"));
    await interaction.reply(
      buildStaffReply("rolepersist", { targetUser: target.targetUser, caseDocument, role, operation, enabled })
    );
  },
};

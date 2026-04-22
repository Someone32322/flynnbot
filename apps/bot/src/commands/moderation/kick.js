const { SlashCommandBuilder } = require("discord.js");
const {
  buildActionDm,
  buildStaffReply,
  createModerationCase,
  ensureTargetModeratable,
  ephemeral,
  getAuditColor,
  logCaseToAudit,
  requireModeratorAccess,
  resolveModerationTarget,
  sendDmNotice,
} = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server.")
    .addUserOption((option) => option.setName("user").setDescription("Member to kick").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Kick reason").setRequired(false)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const target = await resolveModerationTarget(interaction, "user", "unused_user_id");
    if (!target?.targetMember || !(await ensureTargetModeratable(interaction, target.targetMember))) {
      return;
    }

    const reason = interaction.options.getString("reason") || "No reason provided.";
    const dmResult = await sendDmNotice(
      target.targetUser,
      buildActionDm("kick", interaction.guild.name, interaction.user.tag, reason)
    );

    await target.targetMember.kick(reason);
    const caseDocument = await createModerationCase({
      guild: interaction.guild,
      moderator: interaction.user,
      targetUser: target.targetUser,
      type: "kick",
      reason,
      dmDelivered: dmResult.delivered,
      metadata: { dmStatus: dmResult.suffix },
    });

    await logCaseToAudit(
      interaction.guild,
      guildConfig,
      caseDocument,
      [{ name: "DM Status", value: dmResult.suffix, inline: true }],
      getAuditColor("kick")
    );

    await interaction.reply(
      buildStaffReply("kick", { targetUser: target.targetUser, caseDocument, dmResult })
    );
  },
};

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
    .setName("softban")
    .setDescription("Softban a member by banning and immediately unbanning them.")
    .addUserOption((option) => option.setName("user").setDescription("Member to softban").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Softban reason").setRequired(false)),
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
      buildActionDm("softban", interaction.guild.name, interaction.user.tag, reason)
    );

    await interaction.guild.members.ban(target.targetUser.id, { reason, deleteMessageSeconds: 7 * 24 * 60 * 60 });
    await interaction.guild.members.unban(target.targetUser.id, `Softban cleanup: ${reason}`);

    const caseDocument = await createModerationCase({
      guild: interaction.guild,
      moderator: interaction.user,
      targetUser: target.targetUser,
      type: "softban",
      reason,
      dmDelivered: dmResult.delivered,
      metadata: { dmStatus: dmResult.suffix },
    });

    await logCaseToAudit(
      interaction.guild,
      guildConfig,
      caseDocument,
      [{ name: "DM Status", value: dmResult.suffix, inline: true }],
      getAuditColor("softban")
    );

    await interaction.reply(
      buildStaffReply("softban", { targetUser: target.targetUser, caseDocument, dmResult })
    );
  },
};

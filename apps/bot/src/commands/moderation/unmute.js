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
    .setName("unmute")
    .setDescription("Remove a native Discord timeout from a user.")
    .addUserOption((option) => option.setName("user").setDescription("Member to unmute").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Unmute reason").setRequired(false)),
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
    await target.targetMember.timeout(null, reason);

    const activeCases = await ModerationCase.find({ guildId: interaction.guildId, targetUserId: target.targetUser.id, type: "mute", active: true });
    for (const caseDocument of activeCases) {
      await closeCase(caseDocument, `Manual unmute: ${reason}`);
    }

    await logToAuditChannel(
      interaction.guild,
      guildConfig,
      "Manual unmute",
      [
        { name: "Target", value: `<@${target.targetUser.id}>`, inline: true },
        { name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Reason", value: reason, inline: false },
      ],
      getAuditColor("unmute")
    );

    await interaction.reply(buildStaffReply("unmute", { targetUser: target.targetUser }));
  },
};

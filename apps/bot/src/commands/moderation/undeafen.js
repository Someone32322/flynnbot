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
    .setName("undeafen")
    .setDescription("Remove server deafen from a user.")
    .addUserOption((option) => option.setName("user").setDescription("Member to undeafen").setRequired(true)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const target = await resolveModerationTarget(interaction, "user", "unused_user_id");
    if (!target?.targetMember || !(await ensureTargetModeratable(interaction, target.targetMember))) {
      return;
    }

    await target.targetMember.voice.setDeaf(false, `Manual undeafen by ${interaction.user.tag}`);
    const activeCases = await ModerationCase.find({ guildId: interaction.guildId, targetUserId: target.targetUser.id, type: "deafen", active: true });
    for (const caseDocument of activeCases) {
      await closeCase(caseDocument, `Manual undeafen by ${interaction.user.tag}`);
    }

    await logToAuditChannel(
      interaction.guild,
      guildConfig,
      "Manual undeafen",
      [
        { name: "Target", value: `<@${target.targetUser.id}>`, inline: true },
        { name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
      ],
      getAuditColor("undeafen")
    );

    await interaction.reply(buildStaffReply("undeafen", { targetUser: target.targetUser }));
  },
};

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
    .setName("unvcmute")
    .setDescription("Remove server mute from a user in voice.")
    .addUserOption((option) => option.setName("user").setDescription("Member to voice unmute").setRequired(true)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const target = await resolveModerationTarget(interaction, "user", "unused_user_id");
    if (!target?.targetMember || !(await ensureTargetModeratable(interaction, target.targetMember))) {
      return;
    }

    await target.targetMember.voice.setMute(false, `Manual voice unmute by ${interaction.user.tag}`);
    const activeCases = await ModerationCase.find({ guildId: interaction.guildId, targetUserId: target.targetUser.id, type: "vcmute", active: true });
    for (const caseDocument of activeCases) {
      await closeCase(caseDocument, `Manual voice unmute by ${interaction.user.tag}`);
    }

    await logToAuditChannel(
      interaction.guild,
      guildConfig,
      "Manual voice unmute",
      [
        { name: "Target", value: `<@${target.targetUser.id}>`, inline: true },
        { name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
      ],
      getAuditColor("unvcmute")
    );

    await interaction.reply(buildStaffReply("unvcmute", { targetUser: target.targetUser }));
  },
};

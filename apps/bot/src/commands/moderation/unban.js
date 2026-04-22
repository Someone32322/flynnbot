const { SlashCommandBuilder } = require("discord.js");
const { ModerationCase } = require("../../models/ModerationCase");
const {
  buildStaffReply,
  closeCase,
  ephemeral,
  getAuditColor,
  logToAuditChannel,
  parseUserId,
  requireModeratorAccess,
  resolveUserFromInput,
} = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user by ID or mention.")
    .addStringOption((option) => option.setName("user_id").setDescription("User ID or mention").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Unban reason").setRequired(false)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const input = interaction.options.getString("user_id", true);
    const userId = parseUserId(input);
    if (!userId) {
      await interaction.reply(ephemeral("Provide a valid user ID or mention."));
      return;
    }

    const reason = interaction.options.getString("reason") || "No reason provided.";
    await interaction.guild.members.unban(userId, reason);

    const activeCases = await ModerationCase.find({ guildId: interaction.guildId, targetUserId: userId, type: "ban", active: true });
    for (const caseDocument of activeCases) {
      await closeCase(caseDocument, `Manual unban: ${reason}`);
    }

    const targetUser = await resolveUserFromInput(interaction.client, userId);
    await logToAuditChannel(
      interaction.guild,
      guildConfig,
      "Manual unban",
      [
        { name: "Target", value: targetUser ? `${targetUser.tag} (${targetUser.id})` : userId, inline: false },
        { name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Reason", value: reason, inline: false },
      ],
      getAuditColor("unban")
    );

    await interaction.reply(buildStaffReply("unban", { targetUser, userId }));
  },
};

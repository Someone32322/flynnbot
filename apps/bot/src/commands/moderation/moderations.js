const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const { buildCaseSummary, ephemeral, listActiveCases, requireModeratorAccess, resolveModerationTarget } = require("../../lib/moderation");
const { buildPaginationPayload, createPaginationSession } = require("../../lib/pagination");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("moderations")
    .setDescription("List active moderation cases for a user.")
    .addUserOption((option) => option.setName("user").setDescription("User to inspect").setRequired(true)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const target = await resolveModerationTarget(interaction, "user", "unused_user_id");
    if (!target) {
      await interaction.reply(ephemeral("That user could not be resolved."));
      return;
    }

    const cases = await listActiveCases(interaction.guildId, target.targetUser.id);
    if (cases.length === 0) {
      await interaction.reply(ephemeral("That user has no active moderation cases."));
      return;
    }

    const pages = cases.map((entry) => buildCaseSummary(entry));
    const token = createPaginationSession(
      interaction.client,
      interaction.user.id,
      `Active moderations for ${target.targetUser.tag}`,
      pages
    );

    await interaction.reply({
      ...buildPaginationPayload(interaction.client, token, 0),
      flags: MessageFlags.Ephemeral,
    });
  },
};

const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const { buildSapphireEmbed, ephemeral, listCasesForUser, requireModeratorAccess, resolveModerationTarget } = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("notes")
    .setDescription("Show moderation notes for a user.")
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

    const cases = (await listCasesForUser(interaction.guildId, target.targetUser.id, ["note"]))
      .filter((entry) => !entry.removedAt)
      .slice(0, 10);

    if (cases.length === 0) {
      await interaction.reply(ephemeral("No notes were found for that user."));
      return;
    }

    const embed = buildSapphireEmbed({
      title: `Notes for ${target.targetUser.tag}`,
      description: cases.map((entry) => `#${entry.caseNumber}: ${entry.metadata?.note || entry.reason}`).join("\n\n"),
    });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

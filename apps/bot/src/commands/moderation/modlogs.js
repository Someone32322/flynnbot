const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const { buildSapphireEmbed, ephemeral, listCasesForUser, requireModeratorAccess, resolveModerationTarget } = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("modlogs")
    .setDescription("View moderation history for a user.")
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

    const cases = (await listCasesForUser(interaction.guildId, target.targetUser.id)).slice(0, 15);
    if (cases.length === 0) {
      await interaction.reply(ephemeral("No moderation history exists for that user."));
      return;
    }

    const embed = buildSapphireEmbed({
      title: `Moderation logs for ${target.targetUser.tag}`,
      description: cases
        .map((entry) => `#${entry.caseNumber} | ${entry.type} | ${entry.reason} | ${entry.active ? "active" : "closed"}`)
        .join("\n"),
    });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

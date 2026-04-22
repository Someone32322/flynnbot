const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const { buildSapphireEmbed, ephemeral, requireModeratorAccess } = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("members")
    .setDescription("List up to 90 members with a specific role.")
    .addRoleOption((option) => option.setName("role").setDescription("Role to inspect").setRequired(true)),
  async execute(interaction) {
    const guildConfig = await requireModeratorAccess(interaction);
    if (!guildConfig) {
      return;
    }

    const role = interaction.options.getRole("role", true);
    const members = role.members.map((member) => `${member.user.tag} (${member.id})`).slice(0, 90);

    if (members.length === 0) {
      await interaction.reply(ephemeral("No cached members have that role."));
      return;
    }

    const embed = buildSapphireEmbed({
      title: `Members with ${role.name}`,
      description: members.join("\n"),
      footerText: members.length === 90 ? "Showing first 90 members." : `${members.length} members shown.`,
    });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

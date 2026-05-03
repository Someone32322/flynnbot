const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { buildSapphireEmbed, getModerationConfig } = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk delete messages from this channel.")
    .addIntegerOption((opt) =>
      opt
        .setName("amount")
        .setDescription("How many messages to remove (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addUserOption((opt) => opt.setName("user").setDescription("Only delete messages from this user").setRequired(false)),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.editReply({
        embeds: [buildSapphireEmbed({ title: "Purge", description: "You need Manage Messages permission." })],
      });
      return;
    }

    const amount = interaction.options.getInteger("amount", true);
    const targetUser = interaction.options.getUser("user");

    const fetched = await interaction.channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!fetched) {
      await interaction.editReply({ embeds: [buildSapphireEmbed({ title: "Purge", description: "Could not fetch channel messages." })] });
      return;
    }

    // Respect the purgePinned dashboard setting
    const modConfig = await getModerationConfig(interaction.guildId);
    const allowPinned = modConfig?.purgePinned === true;

    let candidates = [...fetched.values()].filter((m) => allowPinned || !m.pinned);
    if (targetUser) candidates = candidates.filter((m) => m.author?.id === targetUser.id);
    candidates = candidates.slice(0, amount);

    if (!candidates.length) {
      await interaction.editReply({ embeds: [buildSapphireEmbed({ title: "Purge", description: "No matching messages found." })] });
      return;
    }

    const deleted = await interaction.channel.bulkDelete(candidates.map((m) => m.id), true).catch(() => null);
    const count = deleted?.size || 0;

    await interaction.editReply({
      embeds: [
        buildSapphireEmbed({
          title: "Purge Complete",
          description: `Deleted **${count}** message(s)${targetUser ? ` from <@${targetUser.id}>` : ""}.`,
        }),
      ],
    });
  },
};

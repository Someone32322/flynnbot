const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const { GuildConfig } = require("../../models/GuildConfig");
const { ephemeral, logToAuditChannel, requireAdminAccess } = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setmodrole")
    .setDescription("Set or clear the moderator role used for moderation commands.")
    .addRoleOption((option) =>
      option.setName("role").setDescription("Role to allow moderation commands for").setRequired(false)
    )
    .addBooleanOption((option) =>
      option.setName("clear").setDescription("Clear the configured moderator role").setRequired(false)
    ),
  async execute(interaction) {
    const hasAccess = await requireAdminAccess(interaction);
    if (!hasAccess) {
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildConfig = await GuildConfig.findOneAndUpdate(
      { guildId: interaction.guildId },
      { $setOnInsert: { guildId: interaction.guildId } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    const role = interaction.options.getRole("role");
    const shouldClear = interaction.options.getBoolean("clear") ?? false;

    if (!role && !shouldClear) {
      await interaction.editReply(ephemeral("Provide a role or set clear to true."));
      return;
    }

    const moderatorRoleId = shouldClear ? null : role.id;
    await GuildConfig.updateOne(
      { guildId: interaction.guildId },
      { $set: { "moderation.moderatorRoleId": moderatorRoleId } },
      { upsert: true }
    );

    await logToAuditChannel(
      interaction.guild,
      { moderation: { auditLogChannelId: guildConfig.moderation?.auditLogChannelId } },
      "Moderation config updated",
      [
        { name: "Setting", value: "Moderator role", inline: true },
        { name: "Value", value: moderatorRoleId ? `<@&${moderatorRoleId}>` : "Cleared", inline: true },
        { name: "Updated By", value: `<@${interaction.user.id}>`, inline: false },
      ],
      0x57f287
    );

    await interaction.editReply(
      ephemeral(
        moderatorRoleId
          ? `Moderator role set to <@&${moderatorRoleId}>.`
          : "Moderator role configuration cleared."
      )
    );
  },
};

const { ChannelType, MessageFlags, SlashCommandBuilder } = require("discord.js");
const { GuildConfig } = require("../../models/GuildConfig");
const { ephemeral, requireAdminAccess } = require("../../lib/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setauditlog")
    .setDescription("Set or clear the audit log channel for moderation actions.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to send moderation audit logs to")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option.setName("clear").setDescription("Clear the configured audit log channel").setRequired(false)
    ),
  async execute(interaction) {
    const hasAccess = await requireAdminAccess(interaction);
    if (!hasAccess) {
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channel = interaction.options.getChannel("channel");
    const shouldClear = interaction.options.getBoolean("clear") ?? false;

    if (!channel && !shouldClear) {
      await interaction.editReply(ephemeral("Provide a channel or set clear to true."));
      return;
    }

    const auditLogChannelId = shouldClear ? null : channel.id;
    await GuildConfig.updateOne(
      { guildId: interaction.guildId },
      { $set: { "moderation.auditLogChannelId": auditLogChannelId } },
      { upsert: true }
    );

    await interaction.editReply(
      ephemeral(
        auditLogChannelId
          ? `Audit log channel set to <#${auditLogChannelId}>.`
          : "Audit log channel configuration cleared."
      )
    );
  },
};

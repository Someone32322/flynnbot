const { ChannelType, SlashCommandBuilder } = require("discord.js");
const { ensureManageGuild, updateLevelConfig, buildLevelEmbed } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level-channel")
    .setDescription("Set where level-up messages are sent.")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Target channel")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),
  async execute(interaction) {
    if (!(await ensureManageGuild(interaction))) return;

    const channel = interaction.options.getChannel("channel");
    await updateLevelConfig(interaction.guildId, { levelUpChannelId: channel?.id || null });

    await interaction.editReply({
      embeds: [buildLevelEmbed("Level-up Channel Updated", channel ? `Messages will post in ${channel}.` : "Level-up messages will use the current channel.")],
    });
  },
};

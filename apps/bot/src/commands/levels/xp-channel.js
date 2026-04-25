const { SlashCommandBuilder, ChannelType } = require("discord.js");
const { ensureManageGuild, getLevelConfig, updateLevelConfig, buildLevelEmbed } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("xp-channel")
    .setDescription("Manage channels where XP can be earned.")
    .addStringOption((opt) =>
      opt
        .setName("action")
        .setDescription("Operation")
        .setRequired(true)
        .addChoices(
          { name: "Add", value: "add" },
          { name: "Remove", value: "remove" },
          { name: "Clear (all channels)", value: "clear" },
          { name: "List", value: "list" }
        )
    )
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel for add/remove")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),
  async execute(interaction) {
    if (!(await ensureManageGuild(interaction))) return;

    const action = interaction.options.getString("action", true);
    const channel = interaction.options.getChannel("channel");
    const cfg = await getLevelConfig(interaction.guildId);
    const channels = new Set(cfg.xpChannels || []);

    if ((action === "add" || action === "remove") && !channel) {
      await interaction.editReply({ embeds: [buildLevelEmbed("XP Channels", "You must provide a channel for add/remove.")] });
      return;
    }

    if (action === "add") channels.add(channel.id);
    if (action === "remove") channels.delete(channel.id);
    if (action === "clear") channels.clear();

    if (action !== "list") {
      await updateLevelConfig(interaction.guildId, { xpChannels: [...channels] });
    }

    const text = channels.size ? [...channels].map((id) => `<#${id}>`).join(", ") : "All channels";
    await interaction.editReply({ embeds: [buildLevelEmbed("XP Channels", text)] });
  },
};

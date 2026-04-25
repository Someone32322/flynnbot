const { SlashCommandBuilder } = require("discord.js");
const { getLevelConfig, buildLevelEmbed, formatConfig } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level-config")
    .setDescription("Display current leveling configuration."),
  async execute(interaction) {
    const cfg = await getLevelConfig(interaction.guildId);
    const f = formatConfig(cfg);

    await interaction.editReply({
      embeds: [
        buildLevelEmbed("Leveling Configuration", "Current settings for this server.", [
          { name: "Enabled", value: cfg.enabled ? "Yes" : "No", inline: true },
          { name: "XP per Message", value: String(cfg.xpRate), inline: true },
          { name: "Cooldown", value: `${cfg.xpCooldown}s`, inline: true },
          { name: "XP Channels", value: f.channels, inline: false },
          { name: "Role Stack", value: cfg.roleStack ? "Keep all reward roles" : "Only highest reward role", inline: false },
          { name: "Level-up Channel", value: cfg.levelUpChannelId ? `<#${cfg.levelUpChannelId}>` : "Current channel", inline: false },
          { name: "Formula", value: `a=${cfg.formula.a}, b=${cfg.formula.b}, c=${cfg.formula.c}`, inline: false },
          { name: "Rewards", value: f.rewards, inline: false },
        ]),
      ],
    });
  },
};

const { SlashCommandBuilder } = require("discord.js");
const { ensureManageGuild, getLevelConfig, levelFromXp, LevelProfile, buildLevelEmbed } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level-import")
    .setDescription("Import leveling data from a JSON file.")
    .addAttachmentOption((opt) => opt.setName("file").setDescription("JSON file").setRequired(true)),
  async execute(interaction) {
    if (!(await ensureManageGuild(interaction))) return;

    const file = interaction.options.getAttachment("file", true);
    if (!file.name?.toLowerCase().endsWith(".json")) {
      await interaction.editReply({ embeds: [buildLevelEmbed("Import Failed", "Attachment must be a .json file.")] });
      return;
    }

    let parsed;
    try {
      const resp = await fetch(file.url);
      parsed = await resp.json();
    } catch {
      await interaction.editReply({ embeds: [buildLevelEmbed("Import Failed", "Could not read JSON file.")] });
      return;
    }

    if (!Array.isArray(parsed)) {
      await interaction.editReply({ embeds: [buildLevelEmbed("Import Failed", "JSON must be an array of records.")] });
      return;
    }

    const cfg = await getLevelConfig(interaction.guildId);
    const ops = [];
    for (const row of parsed.slice(0, 10000)) {
      if (!row || typeof row !== "object") continue;
      const userId = String(row.userId || "").trim();
      if (!/^\d+$/.test(userId)) continue;
      const xp = Math.max(0, Number(row.xp) || 0);
      const level = Number.isFinite(Number(row.level)) ? Math.max(0, Number(row.level)) : levelFromXp(xp, cfg.formula);
      ops.push({
        updateOne: {
          filter: { guildId: interaction.guildId, userId },
          update: {
            $set: { xp, level },
            $setOnInsert: { guildId: interaction.guildId, userId },
          },
          upsert: true,
        },
      });
    }

    if (ops.length) await LevelProfile.bulkWrite(ops, { ordered: false });

    await interaction.editReply({
      embeds: [buildLevelEmbed("Import Complete", `Imported **${ops.length}** leveling records.`)],
    });
  },
};

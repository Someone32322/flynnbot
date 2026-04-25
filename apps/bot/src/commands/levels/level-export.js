const { AttachmentBuilder, SlashCommandBuilder } = require("discord.js");
const { LevelProfile, buildLevelEmbed } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder().setName("level-export").setDescription("Export leveling data as JSON."),
  async execute(interaction) {
    const docs = await LevelProfile.find({ guildId: interaction.guildId }).sort({ xp: -1 }).lean();
    const payload = docs.map((d) => ({ userId: d.userId, xp: d.xp, level: d.level }));
    const data = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
    const attachment = new AttachmentBuilder(data, { name: `leveling-${interaction.guildId}.json` });

    await interaction.editReply({
      embeds: [buildLevelEmbed("Level Export", `Exported **${payload.length}** records.`)],
      files: [attachment],
    });
  },
};

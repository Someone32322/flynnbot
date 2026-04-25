const { SlashCommandBuilder } = require("discord.js");
const { ensureManageGuild, getLevelConfig, levelFromXp, LevelProfile, buildLevelEmbed } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("xp-giveall")
    .setDescription("Give XP to all members in this server.")
    .addIntegerOption((opt) => opt.setName("amount").setDescription("XP amount").setRequired(true).setMinValue(1).setMaxValue(1000)),
  async execute(interaction) {
    if (!(await ensureManageGuild(interaction))) return;

    const amount = interaction.options.getInteger("amount", true);
    const cfg = await getLevelConfig(interaction.guildId);

    const members = await interaction.guild.members.fetch();
    const targets = members.filter((m) => !m.user.bot);

    const ops = [];
    for (const m of targets.values()) {
      const current = await LevelProfile.findOne({ guildId: interaction.guildId, userId: m.id }).lean();
      const nextXp = Math.max(0, (current?.xp || 0) + amount);
      ops.push({
        updateOne: {
          filter: { guildId: interaction.guildId, userId: m.id },
          update: {
            $set: {
              xp: nextXp,
              level: levelFromXp(nextXp, cfg.formula),
            },
            $setOnInsert: { guildId: interaction.guildId, userId: m.id },
          },
          upsert: true,
        },
      });
    }

    if (ops.length) await LevelProfile.bulkWrite(ops, { ordered: false });

    await interaction.editReply({
      embeds: [buildLevelEmbed("XP Give All", `Added **${amount} XP** to **${targets.size}** members.`)],
    });
  },
};

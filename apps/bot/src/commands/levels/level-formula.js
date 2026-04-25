const { SlashCommandBuilder } = require("discord.js");
const { ensureManageGuild, getLevelConfig, updateLevelConfig, normalizeFormula, buildLevelEmbed } = require("./_shared");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level-formula")
    .setDescription("Set or view leveling formula constants.")
    .addNumberOption((opt) => opt.setName("a").setDescription("Quadratic multiplier").setRequired(false))
    .addNumberOption((opt) => opt.setName("b").setDescription("Linear multiplier").setRequired(false))
    .addNumberOption((opt) => opt.setName("c").setDescription("Base XP").setRequired(false)),
  async execute(interaction) {
    if (!(await ensureManageGuild(interaction))) return;

    const a = interaction.options.getNumber("a");
    const b = interaction.options.getNumber("b");
    const c = interaction.options.getNumber("c");

    if (a == null && b == null && c == null) {
      const cfg = await getLevelConfig(interaction.guildId);
      await interaction.editReply({
        embeds: [buildLevelEmbed("Current Formula", `a=${cfg.formula.a}, b=${cfg.formula.b}, c=${cfg.formula.c}`)],
      });
      return;
    }

    const cfg = await getLevelConfig(interaction.guildId);
    const formula = normalizeFormula({
      a: a ?? cfg.formula.a,
      b: b ?? cfg.formula.b,
      c: c ?? cfg.formula.c,
    });

    await updateLevelConfig(interaction.guildId, { formula });
    await interaction.editReply({
      embeds: [buildLevelEmbed("Formula Updated", `a=${formula.a}, b=${formula.b}, c=${formula.c}`)],
    });
  },
};

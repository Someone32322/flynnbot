const { PermissionFlagsBits } = require("discord.js");
const {
  buildLevelEmbed,
  getLevelConfig,
  updateLevelConfig,
  getOrCreateLevelProfile,
  levelFromXp,
  totalXpForLevel,
  progressForXp,
  progressBar,
  computeRank,
  buildRankCard,
  buildLeaderboardCard,
  LevelProfile,
  normalizeFormula,
  applyLevelRewards,
  SAPPHIRE,
} = require("../../lib/leveling");

function hasManageGuild(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.guild.ownerId === interaction.user.id;
}

async function ensureManageGuild(interaction) {
  if (hasManageGuild(interaction)) return true;
  await interaction.editReply({
    embeds: [buildLevelEmbed("Permission Denied", "You need Manage Server permission to use this command.")],
  });
  return false;
}

function formatConfig(cfg) {
  const channels = cfg.xpChannels.length ? cfg.xpChannels.map((id) => `<#${id}>`).join(", ") : "All channels";
  const rewards = cfg.rewards.length
    ? cfg.rewards.map((r) => `Level ${r.level}: <@&${r.roleId}>`).join("\n")
    : "None configured";

  return {
    channels,
    rewards,
  };
}

async function getProfileAndComputed(guildId, userId) {
  const cfg = await getLevelConfig(guildId);
  const profile = await getOrCreateLevelProfile(guildId, userId);
  const computed = levelFromXp(profile.xp, cfg.formula);
  if (profile.level !== computed) {
    profile.level = computed;
    await profile.save();
  }
  return { cfg, profile };
}

module.exports = {
  ensureManageGuild,
  getLevelConfig,
  updateLevelConfig,
  getOrCreateLevelProfile,
  levelFromXp,
  totalXpForLevel,
  progressForXp,
  progressBar,
  computeRank,
  buildRankCard,
  buildLeaderboardCard,
  buildLevelEmbed,
  LevelProfile,
  normalizeFormula,
  applyLevelRewards,
  formatConfig,
  getProfileAndComputed,
  SAPPHIRE,
};

const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed,
  checkCooldown, msToHuman, weightedRandom, HUNT_TABLE, GREEN, RED,
} = require('../../lib/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hunt')
    .setDescription('Go hunting and catch wild animals.'),
  async execute(interaction) {
    await interaction.deferReply();
    const cfg = await getConfig(interaction.guildId);
    if (!cfg.enabled) return interaction.editReply({ embeds: [disabledEmbed()] });
    if (!isChannelAllowed(cfg, interaction.channelId)) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Wrong Channel', 'Economy commands are restricted to specific channels.', RED)] });
    }

    const profile = await getProfile(interaction.guildId, interaction.user.id);
    const cooldownMs = (cfg.huntCooldownMinutes ?? 25) * 60_000;
    const cd = checkCooldown(profile.lastHunt, cooldownMs);
    if (!cd.ready) {
      return interaction.editReply({
        embeds: [economyEmbed('⏱️ Hunting Cooldown', `You need to rest. Come back in **${msToHuman(cd.remaining)}**.`, RED)],
      });
    }

    const sym = cfg.currencySymbol || '💎';
    const name = cfg.currencyName || 'Flynn Coins';

    // 10% chance to catch nothing
    if (Math.random() < 0.1) {
      profile.lastHunt = new Date();
      await profile.save();
      return interaction.editReply({
        embeds: [economyEmbed('🏹 Nothing Caught', 'You hunted but your prey escaped. Better luck next time!', RED)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))],
      });
    }

    const prey = weightedRandom(HUNT_TABLE);

    // Add to inventory
    const existingIdx = profile.inventory.findIndex((i) => i.itemId === prey.itemId);
    if (existingIdx >= 0) {
      profile.inventory[existingIdx].quantity += 1;
    } else {
      profile.inventory.push({ itemId: prey.itemId, name: prey.name, quantity: 1, type: 'hunt', emoji: prey.emoji });
    }
    profile.markModified('inventory');
    profile.lastHunt = new Date();
    await profile.save();

    const embed = economyEmbed(`🏹 Hunted a ${prey.name}!`, `You caught a **${prey.emoji} ${prey.name}**!\nSell it for ${sym} **${prey.value.toLocaleString()}** ${name} with \`/sell\`.`, GREEN)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }));

    await interaction.editReply({ embeds: [embed] });
  },
};

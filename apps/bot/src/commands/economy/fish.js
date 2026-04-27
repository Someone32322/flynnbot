const { SlashCommandBuilder } = require('discord.js');
const {
  getConfig, getProfile, economyEmbed, disabledEmbed, isChannelAllowed,
  checkCooldown, msToHuman, weightedRandom, FISH_TABLE, GREEN, RED,
} = require('../../lib/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fish')
    .setDescription('Go fishing and catch something valuable.'),
  async execute(interaction) {
    await interaction.deferReply();
    const cfg = await getConfig(interaction.guildId);
    if (!cfg.enabled) return interaction.editReply({ embeds: [disabledEmbed()] });
    if (!isChannelAllowed(cfg, interaction.channelId)) {
      return interaction.editReply({ embeds: [economyEmbed('❌ Wrong Channel', 'Economy commands are restricted to specific channels.', RED)] });
    }

    const profile = await getProfile(interaction.guildId, interaction.user.id);
    const cooldownMs = (cfg.fishCooldownMinutes ?? 20) * 60_000;
    const cd = checkCooldown(profile.lastFish, cooldownMs);
    if (!cd.ready) {
      return interaction.editReply({
        embeds: [economyEmbed('⏱️ Fishing Cooldown', `Your line is still in the water. Wait **${msToHuman(cd.remaining)}**.`, RED)],
      });
    }

    const sym = cfg.currencySymbol || '💎';
    const name = cfg.currencyName || 'Flynn Coins';
    const catch_ = weightedRandom(FISH_TABLE);

    // 10% chance to catch nothing
    if (Math.random() < 0.1) {
      profile.lastFish = new Date();
      await profile.save();
      return interaction.editReply({
        embeds: [economyEmbed('🎣 Nothing Caught', 'You cast your line but caught nothing. Better luck next time!', RED)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))],
      });
    }

    // Add to inventory
    const existingIdx = profile.inventory.findIndex((i) => i.itemId === catch_.itemId);
    if (existingIdx >= 0) {
      profile.inventory[existingIdx].quantity += 1;
    } else {
      profile.inventory.push({ itemId: catch_.itemId, name: catch_.name, quantity: 1, type: 'fish', emoji: catch_.emoji });
    }
    profile.markModified('inventory');
    profile.lastFish = new Date();
    await profile.save();

    const embed = economyEmbed(`🎣 Caught a ${catch_.name}!`, `You reeled in a **${catch_.emoji} ${catch_.name}**!\nSell it for ${sym} **${catch_.value.toLocaleString()}** ${name} with \`/sell\`.`, GREEN)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }));

    await interaction.editReply({ embeds: [embed] });
  },
};

const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const SAPPHIRE = 0x0f52ba;

const VERIFICATION_LEVELS = ['None', 'Low', 'Medium', 'High', 'Highest'];
const BOOST_TIERS = ['No Tier', 'Tier 1', 'Tier 2', 'Tier 3'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guildinfo')
    .setDescription('Display detailed information about this server.'),

  async execute(interaction) {
    const guild = await interaction.guild.fetch();
    const owner = await interaction.client.users.fetch(guild.ownerId).catch(() => null);

    const created = `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`;
    const memberCount = guild.memberCount;
    const botCount = guild.members.cache.filter((m) => m.user.bot).size;
    const humanCount = memberCount - botCount;

    const lines = [
      `> **Owner:** ${owner ? `${owner.tag} \`(${owner.id})\`` : `\`${guild.ownerId}\``}`,
      `> **Created:** ${created}`,
      `> **Members:** ${memberCount} total · ${humanCount} human · ${botCount} bot`,
      `> **Channels:** ${guild.channels.cache.size}`,
      `> **Roles:** ${guild.roles.cache.size}`,
      `> **Emojis:** ${guild.emojis.cache.size}`,
      `> **Boost Level:** ${BOOST_TIERS[guild.premiumTier] ?? 'Unknown'}`,
      `> **Boosts:** ${guild.premiumSubscriptionCount ?? 0}`,
      `> **Verification:** ${VERIFICATION_LEVELS[guild.verificationLevel] ?? 'Unknown'}`,
      guild.description ? `> **Description:** ${guild.description}` : null,
    ].filter(Boolean);

    const embed = new EmbedBuilder()
      .setColor(SAPPHIRE)
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Guild ID: ${guild.id}` })
      .setTimestamp();

    if (guild.banner) embed.setImage(guild.bannerURL({ size: 1024 }));

    await interaction.reply({ embeds: [embed] });
  },
};

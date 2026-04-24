const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const SAPPHIRE = 0x0f52ba;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Display detailed information about a user.')
    .addUserOption((o) => o.setName('user').setDescription('User to inspect (defaults to yourself)')),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    await targetUser.fetch({ force: true }).catch(() => null);
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    const created = `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:F>`;
    const joined = member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'N/A';

    const roleList = member
      ? [...member.roles.cache.values()]
          .filter((r) => r.id !== interaction.guild.id)
          .sort((a, b) => b.position - a.position)
          .slice(0, 15)
          .map((r) => r.toString())
          .join(', ') || 'None'
      : 'N/A';

    const badges = [];
    const flags = targetUser.flags?.toArray() ?? [];
    const flagLabels = {
      Staff: '🛠️ Discord Staff',
      Partner: '🤝 Partner',
      Hypesquad: '🏅 HypeSquad Events',
      BugHunterLevel1: '🐛 Bug Hunter',
      BugHunterLevel2: '🐛 Bug Hunter Gold',
      HypeSquadOnlineHouse1: '🏠 Bravery',
      HypeSquadOnlineHouse2: '🏠 Brilliance',
      HypeSquadOnlineHouse3: '🏠 Balance',
      PremiumEarlySupporter: '🌟 Early Supporter',
      VerifiedDeveloper: '💻 Early Verified Bot Developer',
      ActiveDeveloper: '🔧 Active Developer',
    };
    for (const flag of flags) if (flagLabels[flag]) badges.push(flagLabels[flag]);

    const lines = [
      `> **ID:** \`${targetUser.id}\``,
      `> **Bot:** ${targetUser.bot ? 'Yes' : 'No'}`,
      `> **Created:** ${created}`,
      `> **Joined:** ${joined}`,
      member?.nickname ? `> **Nickname:** ${member.nickname}` : null,
      member?.premiumSince ? `> **Boosting Since:** <t:${Math.floor(member.premiumSinceTimestamp / 1000)}:F>` : null,
      `> **Roles (${member?.roles.cache.size ? member.roles.cache.size - 1 : 0}):** ${roleList}`,
      badges.length ? `> **Badges:** ${badges.join(', ')}` : null,
    ].filter(Boolean);

    const embed = new EmbedBuilder()
      .setColor(SAPPHIRE)
      .setTitle(targetUser.tag)
      .setThumbnail(targetUser.displayAvatarURL({ extension: 'png', size: 256 }))
      .setDescription(lines.join('\n'))
      .setFooter({ text: `ID: ${targetUser.id}` })
      .setTimestamp();

    if (targetUser.banner) embed.setImage(targetUser.bannerURL({ extension: 'png', size: 1024 }));

    await interaction.reply({ embeds: [embed] });
  },
};

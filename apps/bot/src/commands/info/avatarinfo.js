const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const SAPPHIRE = 0x0f52ba;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatarinfo')
    .setDescription("Display a user's avatar with download links.")
    .addUserOption((o) => o.setName('user').setDescription('User to inspect (defaults to yourself)')),

  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    await target.fetch({ force: true }).catch(() => null);
    const member = interaction.guild.members.cache.get(target.id);

    const globalUrl = target.displayAvatarURL({ extension: 'png', size: 4096 });
    const globalGif = target.avatar?.startsWith('a_')
      ? target.displayAvatarURL({ extension: 'gif', size: 4096 })
      : null;

    const fmtLinks = (base) => {
      const isAnim = base.includes('a_');
      const links = ['PNG', 'WEBP', ...(isAnim ? ['GIF'] : [])].map(
        (f) => `[${f}](${target.displayAvatarURL({ extension: f.toLowerCase(), size: 4096 })})`
      );
      return links.join(' · ');
    };

    const embed = new EmbedBuilder()
      .setColor(SAPPHIRE)
      .setTitle(`${target.username}'s Avatar`)
      .setImage(globalGif ?? globalUrl)
      .setDescription([
        `> **User:** ${target} \`(${target.id})\``,
        `> **Animated:** ${target.avatar?.startsWith('a_') ? 'Yes' : 'No'}`,
        `> **Links:** ${fmtLinks(globalUrl)}`,
      ].join('\n'))
      .setFooter({ text: `ID: ${target.id}` })
      .setTimestamp();

    // Server-specific avatar
    if (member?.avatar) {
      const serverUrl = member.displayAvatarURL({ extension: 'png', size: 4096 });
      embed.setDescription(embed.data.description + `\n> **Server Avatar:** [Click to view](${serverUrl})`);
      embed.setThumbnail(serverUrl);
    }

    await interaction.reply({ embeds: [embed] });
  },
};

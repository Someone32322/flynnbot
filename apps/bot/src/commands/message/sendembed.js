const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { requireModeratorAccess, ephemeral } = require('../../lib/moderation');
const { EmbedTemplate } = require('../../models/EmbedTemplate');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sendembed')
    .setDescription('Send a saved embed template to a channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Target channel')
        .setRequired(true)
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
        )
    )
    .addStringOption((o) =>
      o.setName('name').setDescription('Name of the embed template to send').setRequired(true)
    ),

  async execute(interaction) {
    const guard = await requireModeratorAccess(interaction);
    if (!guard) return;

    const channel = interaction.options.getChannel('channel', true);
    const name = interaction.options.getString('name', true).trim();

    if (!channel.isTextBased()) {
      return interaction.reply(ephemeral('That channel cannot receive messages.'));
    }

    // Escape regex special characters so template names match literally
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const template = await EmbedTemplate.findOne({
      guildId: interaction.guildId,
      name: { $regex: `^${escapedName}$`, $options: 'i' },
    });

    if (!template) {
      // Diagnostic: find all templates regardless of guild to detect DB/guildId mismatch
      const allInGuild = await EmbedTemplate.find({ guildId: interaction.guildId }).select('name').lean();
      const allInDb    = await EmbedTemplate.find({}).select('guildId name').lean();
      const dbName = EmbedTemplate.db?.name ?? 'unknown';

      console.log(`[sendembed] DB: ${dbName} | guildId: ${interaction.guildId}`);
      console.log(`[sendembed] All templates in DB:`, allInDb.map(t => `${t.guildId}::${t.name}`));

      const guildList = allInGuild.length ? allInGuild.map((t) => `\`${t.name}\``).join(', ') : '*(none)*';
      const dbList    = allInDb.length
        ? allInDb.map((t) => `${t.guildId === interaction.guildId ? '✅' : '❌'} \`${t.guildId}\` → \`${t.name}\``).join('\n> ')
        : '*(collection is empty)*';

      return interaction.reply(
        ephemeral(
          `No template found for \`${name}\`.\n` +
          `> **DB:** \`${dbName}\`\n` +
          `> **Guild ID:** \`${interaction.guildId}\`\n` +
          `> **In this guild:** ${guildList}\n` +
          `> **All in DB:**\n> ${dbList}`
        )
      );
    }

    const embed = new EmbedBuilder().setColor(template.color ?? 0x0f52ba);
    if (template.title) embed.setTitle(template.title);
    if (template.description) embed.setDescription(template.description);
    if (template.footer) embed.setFooter({ text: template.footer });
    if (template.imageUrl) embed.setImage(template.imageUrl);
    if (template.thumbnailUrl) embed.setThumbnail(template.thumbnailUrl);
    if (template.author) embed.setAuthor({ name: template.author });
    if (template.fields?.length) embed.addFields(template.fields);

    const sent = await channel.send({ embeds: [embed] }).catch((err) => {
      console.error('[sendembed]', err);
      return null;
    });

    if (!sent) {
      return interaction.reply(ephemeral('Failed to send embed — check my permissions in that channel.'));
    }

    await interaction.reply(
      ephemeral(`✅ Embed \`${template.name}\` sent to ${channel} — [Jump to message](${sent.url})`)
    );
  },
};

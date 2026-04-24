const { EmbedBuilder, PermissionsBitField, SlashCommandBuilder } = require('discord.js');

const SAPPHIRE = 0x0f52ba;

const PERM_LABELS = {
  AddReactions: 'Add Reactions',
  Administrator: 'Administrator',
  AttachFiles: 'Attach Files',
  BanMembers: 'Ban Members',
  ChangeNickname: 'Change Nickname',
  Connect: 'Connect',
  CreateInstantInvite: 'Create Invite',
  DeafenMembers: 'Deafen Members',
  EmbedLinks: 'Embed Links',
  KickMembers: 'Kick Members',
  ManageChannels: 'Manage Channels',
  ManageEmojisAndStickers: 'Manage Emojis & Stickers',
  ManageGuild: 'Manage Server',
  ManageMessages: 'Manage Messages',
  ManageNicknames: 'Manage Nicknames',
  ManageRoles: 'Manage Roles',
  ManageThreads: 'Manage Threads',
  ManageWebhooks: 'Manage Webhooks',
  MentionEveryone: 'Mention Everyone',
  ModerateMembers: 'Timeout Members',
  MoveMembers: 'Move Members',
  MuteMembers: 'Mute Members',
  PrioritySpeaker: 'Priority Speaker',
  ReadMessageHistory: 'Read History',
  RequestToSpeak: 'Request to Speak',
  SendMessages: 'Send Messages',
  SendMessagesInThreads: 'Send in Threads',
  SendTTSMessages: 'TTS Messages',
  Speak: 'Speak',
  Stream: 'Stream',
  UseApplicationCommands: 'Use App Commands',
  UseEmbeddedActivities: 'Use Activities',
  UseExternalEmojis: 'External Emojis',
  UseExternalStickers: 'External Stickers',
  UseVAD: 'Voice Activity',
  ViewAuditLog: 'View Audit Log',
  ViewChannel: 'View Channel',
  ViewGuildInsights: 'View Insights',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roleinfo')
    .setDescription('Display detailed information about a role.')
    .addRoleOption((o) => o.setName('role').setDescription('The role to inspect').setRequired(true)),

  async execute(interaction) {
    const role = interaction.options.getRole('role', true);
    const created = `<t:${Math.floor(role.createdTimestamp / 1000)}:F>`;

    const perms = new PermissionsBitField(role.permissions);
    const permList = Object.entries(PERM_LABELS)
      .filter(([key]) => perms.has(PermissionsBitField.Flags[key]))
      .map(([, label]) => label);

    const memberCount = interaction.guild.members.cache.filter((m) => m.roles.cache.has(role.id)).size;

    const colorHex = role.hexColor !== '#000000' ? role.hexColor : 'Default';

    const lines = [
      `> **ID:** \`${role.id}\``,
      `> **Color:** ${colorHex}`,
      `> **Position:** ${role.position}`,
      `> **Hoisted:** ${role.hoist ? 'Yes' : 'No'}`,
      `> **Mentionable:** ${role.mentionable ? 'Yes' : 'No'}`,
      `> **Managed:** ${role.managed ? 'Yes (bot/integration)' : 'No'}`,
      `> **Members:** ${memberCount}`,
      `> **Created:** ${created}`,
      `> **Permissions (${permList.length}):** ${permList.length ? permList.join(', ') : 'None'}`,
    ];

    const embed = new EmbedBuilder()
      .setColor(SAPPHIRE)
      .setTitle(`@${role.name}`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `ID: ${role.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

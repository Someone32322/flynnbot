/**
 * Static metadata for all bot commands.
 * Used by the dashboard to list commands, show usage/aliases, and build settings UI.
 */
module.exports = {
  // ── General ──────────────────────────────────────────────────
  ping: {
    category: 'General',
    description: 'Health check — returns the bot\'s current WebSocket latency.',
    usage: '/ping',
    aliases: [],
  },
  help: {
    category: 'General',
    description: 'Learn about FlynnBot and how to set up commands via the dashboard.',
    usage: '/help',
    aliases: [],
    globalOnly: true,
  },

  // ── Moderation ────────────────────────────────────────────────
  ban: {
    category: 'Moderation',
    description: 'Permanently ban a member from the server.',
    usage: '/ban <user> [reason] [delete-days]',
    aliases: ['b'],
  },
  kick: {
    category: 'Moderation',
    description: 'Kick a member from the server.',
    usage: '/kick <user> [reason]',
    aliases: ['k'],
  },
  warn: {
    category: 'Moderation',
    description: 'Issue a formal warning to a member.',
    usage: '/warn <user> [reason]',
    aliases: ['w'],
  },
  mute: {
    category: 'Moderation',
    description: 'Timeout (mute) a member for a specified duration.',
    usage: '/mute <user> <duration> [reason]',
    aliases: ['m', 'timeout'],
  },
  unmute: {
    category: 'Moderation',
    description: 'Remove a timeout from a member.',
    usage: '/unmute <user> [reason]',
    aliases: ['untimeout'],
  },
  softban: {
    category: 'Moderation',
    description: 'Ban then immediately unban a user to purge their recent messages.',
    usage: '/softban <user> [reason] [delete-days]',
    aliases: ['sb'],
  },
  deafen: {
    category: 'Moderation',
    description: 'Server-deafen a member in voice channels.',
    usage: '/deafen <user> [reason]',
    aliases: [],
  },
  undeafen: {
    category: 'Moderation',
    description: 'Remove a server deafen from a member.',
    usage: '/undeafen <user> [reason]',
    aliases: [],
  },
  vcmute: {
    category: 'Moderation',
    description: 'Server-mute a member in voice channels.',
    usage: '/vcmute <user> [reason]',
    aliases: [],
  },
  unvcmute: {
    category: 'Moderation',
    description: 'Remove a server voice-mute from a member.',
    usage: '/unvcmute <user> [reason]',
    aliases: [],
  },
  lock: {
    category: 'Moderation',
    description: 'Lock a channel to prevent members from sending messages.',
    usage: '/lock [channel] [reason]',
    aliases: [],
  },
  unlock: {
    category: 'Moderation',
    description: 'Unlock a previously locked channel.',
    usage: '/unlock [channel] [reason]',
    aliases: [],
  },
  lockdown: {
    category: 'Moderation',
    description: 'Lock all channels in the server simultaneously.',
    usage: '/lockdown [reason]',
    aliases: [],
  },
  temprole: {
    category: 'Moderation',
    description: 'Temporarily assign a role to a member for a set duration.',
    usage: '/temprole <user> <role> <duration> [reason]',
    aliases: ['tr'],
  },
  removetemprole: {
    category: 'Moderation',
    description: 'Remove a temporary role assignment early.',
    usage: '/removetemprole <user> <role>',
    aliases: ['rtr'],
  },
  rolepersist: {
    category: 'Moderation',
    description: 'Persist roles on a member so they are re-applied if they rejoin.',
    usage: '/rolepersist <user> <role> [reason]',
    aliases: [],
  },
  unban: {
    category: 'Moderation',
    description: 'Unban a previously banned user.',
    usage: '/unban <user-id> [reason]',
    aliases: [],
  },
  case: {
    category: 'Moderation',
    description: 'Look up the details of a moderation case by its ID.',
    usage: '/case <case-id>',
    aliases: [],
  },
  delwarn: {
    category: 'Moderation',
    description: 'Delete a specific warning case.',
    usage: '/delwarn <case-id>',
    aliases: ['dw'],
  },
  unwarn: {
    category: 'Moderation',
    description: 'Remove (void) a warning from a member.',
    usage: '/unwarn <case-id>',
    aliases: ['uw'],
  },
  duration: {
    category: 'Moderation',
    description: 'Edit the duration of an active timed punishment.',
    usage: '/duration <case-id> <new-duration>',
    aliases: [],
  },
  reason: {
    category: 'Moderation',
    description: 'Edit the reason on an existing moderation case.',
    usage: '/reason <case-id> <new-reason>',
    aliases: [],
  },
  retime: {
    category: 'Moderation',
    description: 'Reset the timer on an active timed punishment.',
    usage: '/retime <case-id>',
    aliases: [],
  },
  note: {
    category: 'Moderation',
    description: 'Add a private staff note to a member\'s record.',
    usage: '/note <user> <note>',
    aliases: [],
  },
  notes: {
    category: 'Moderation',
    description: 'View all staff notes on a member.',
    usage: '/notes <user>',
    aliases: [],
  },
  clearnotes: {
    category: 'Moderation',
    description: 'Clear all staff notes from a member\'s record.',
    usage: '/clearnotes <user>',
    aliases: [],
  },
  editnote: {
    category: 'Moderation',
    description: 'Edit the text of an existing staff note.',
    usage: '/editnote <case-id> <new-text>',
    aliases: [],
  },
  modlogs: {
    category: 'Moderation',
    description: 'View the full moderation history of a member.',
    usage: '/modlogs <user>',
    aliases: ['ml'],
  },
  members: {
    category: 'Moderation',
    description: 'List all active moderation cases in the server.',
    usage: '/members',
    aliases: [],
  },
  moderations: {
    category: 'Moderation',
    description: 'List all moderation actions taken by a specific moderator.',
    usage: '/moderations <moderator>',
    aliases: [],
  },
  modstats: {
    category: 'Moderation',
    description: 'Show moderation action statistics for a moderator.',
    usage: '/modstats <moderator>',
    aliases: [],
  },
  warnings: {
    category: 'Moderation',
    description: 'View all active warnings for a member.',
    usage: '/warnings <user>',
    aliases: [],
  },

  // ── Info ──────────────────────────────────────────────────────
  avatarinfo: {
    category: 'Info',
    description: 'Display a user\'s avatar with download links.',
    usage: '/avatarinfo [user]',
    aliases: [],
  },
  bannerinfo: {
    category: 'Info',
    description: 'Display a user\'s profile banner.',
    usage: '/bannerinfo [user]',
    aliases: [],
  },
  channelinfo: {
    category: 'Info',
    description: 'Display detailed information about a channel.',
    usage: '/channelinfo [channel]',
    aliases: [],
  },
  emojiinfo: {
    category: 'Info',
    description: 'Display information about a custom emoji.',
    usage: '/emojiinfo <emoji>',
    aliases: [],
  },
  guildbannerinfo: {
    category: 'Info',
    description: 'Display the server\'s banner image.',
    usage: '/guildbannerinfo',
    aliases: [],
  },
  guildchannelcount: {
    category: 'Info',
    description: 'Show a breakdown of all channel types in this server.',
    usage: '/guildchannelcount',
    aliases: [],
  },
  guildiconinfo: {
    category: 'Info',
    description: 'Display the server\'s icon with download links.',
    usage: '/guildiconinfo',
    aliases: [],
  },
  guildinfo: {
    category: 'Info',
    description: 'Display detailed information about this server.',
    usage: '/guildinfo',
    aliases: [],
  },
  guildmembercount: {
    category: 'Info',
    description: 'Display a member count breakdown for this server.',
    usage: '/guildmembercount',
    aliases: [],
  },
  guildsplashinfo: {
    category: 'Info',
    description: 'Display the server\'s invite splash image.',
    usage: '/guildsplashinfo',
    aliases: [],
  },
  roleinfo: {
    category: 'Info',
    description: 'Display detailed information about a role.',
    usage: '/roleinfo <role>',
    aliases: [],
  },
  stickerinfo: {
    category: 'Info',
    description: 'Display information about a guild sticker by name.',
    usage: '/stickerinfo <name>',
    aliases: [],
  },
  stickerpackinfo: {
    category: 'Info',
    description: 'Display information about a Discord sticker pack by name.',
    usage: '/stickerpackinfo <name>',
    aliases: [],
  },
  userinfo: {
    category: 'Info',
    description: 'Display detailed information about a user.',
    usage: '/userinfo [user]',
    aliases: [],
  },

  // ── Message ───────────────────────────────────────────────────
  sendmessage: {
    category: 'Message',
    description: 'Send a plain-text message to a channel.',
    usage: '/sendmessage <channel> <content>',
    aliases: [],
  },
  sendembed: {
    category: 'Message',
    description: 'Send a saved embed template to a channel.',
    usage: '/sendembed <channel> <name>',
    aliases: [],
  },

  // ── New Moderation Commands ───────────────────────────────────
  archive: {
    category: 'Moderation',
    description: 'Archive message history for a user or channel.',
    usage: '/archive user <user> [limit] | /archive channel [channel] [limit]',
    aliases: [],
  },
  casedelete: {
    category: 'Moderation',
    description: 'Permanently delete a moderation case.',
    usage: '/casedelete <case-id>',
    aliases: [],
  },
  caseinfo: {
    category: 'Moderation',
    description: 'View detailed information about a case.',
    usage: '/caseinfo <case-id>',
    aliases: [],
  },
  massban: {
    category: 'Moderation',
    description: 'Ban multiple users at once by ID.',
    usage: '/massban <user-ids> [reason] [delete-days]',
    aliases: [],
  },
  masskick: {
    category: 'Moderation',
    description: 'Kick multiple members at once.',
    usage: '/masskick <user-ids> [reason]',
    aliases: [],
  },
  massmute: {
    category: 'Moderation',
    description: 'Timeout multiple members at once.',
    usage: '/massmute <user-ids> [duration] [reason]',
    aliases: [],
  },
  masswarn: {
    category: 'Moderation',
    description: 'Warn multiple members at once.',
    usage: '/masswarn <user-ids> [reason]',
    aliases: [],
  },
  'message-histories': {
    category: 'Moderation',
    description: 'List all message archives for this server.',
    usage: '/message-histories [page]',
    aliases: [],
  },
  predefinedreasons: {
    category: 'Moderation',
    description: 'Manage predefined reasons for moderation actions.',
    usage: '/predefinedreasons <add|list|delete|edit>',
    aliases: [],
  },
  setproof: {
    category: 'Moderation',
    description: 'Add, edit, or delete proof on a moderation case.',
    usage: '/setproof <add|delete|edit>',
    aliases: [],
  },
  slowmode: {
    category: 'Moderation',
    description: 'Set slowmode delay on a channel.',
    usage: '/slowmode <seconds> [channel]',
    aliases: [],
  },
  purge: {
    category: 'Moderation',
    description: 'Bulk delete recent messages in a channel.',
    usage: '/purge <amount> [user]',
    aliases: [],
  },

  // ── Levels ────────────────────────────────────────────────────
  rank: {
    category: 'Levels',
    description: 'Fetch a user\'s XP, level, and rank in this server.',
    usage: '/rank [user]',
    aliases: [],
  },
  leaderboard: {
    category: 'Levels',
    description: 'Show the XP leaderboard for this server.',
    usage: '/leaderboard [limit] [page]',
    aliases: [],
  },
};

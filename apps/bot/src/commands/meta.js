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

  // ── Admin ─────────────────────────────────────────────────────
  setauditlog: {
    category: 'Admin',
    description: 'Set the channel where moderation audit logs are sent.',
    usage: '/setauditlog <channel>',
    aliases: [],
  },
  setmodrole: {
    category: 'Admin',
    description: 'Set the moderator role required to run moderation commands.',
    usage: '/setmodrole <role>',
    aliases: [],
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
};

/**
 * Invite Tracker — tracks which invite code/user caused each new member join.
 */
const { InviteTracker, InviteJoin } = require('../models/InviteTracker');

// In-memory cache: guildId -> Map<code, uses>
const inviteCache = new Map();

async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map();
    for (const [code, invite] of invites) {
      map.set(code, invite.uses || 0);
    }
    inviteCache.set(guild.id, map);
  } catch {
    // No permission or error — just skip
  }
}

async function initAllGuilds(client) {
  for (const [, guild] of client.guilds.cache) {
    await cacheGuildInvites(guild).catch(() => null);
  }
}

async function handleGuildCreate(guild) {
  await cacheGuildInvites(guild).catch(() => null);
}

async function handleMemberAdd(member) {
  const guild = member.guild;
  const oldCache = inviteCache.get(guild.id) || new Map();
  let newInvites;

  try {
    const fetched = await guild.invites.fetch();
    newInvites = new Map(fetched.map((inv) => [inv.code, inv.uses || 0]));
  } catch {
    return; // No permission
  }

  inviteCache.set(guild.id, newInvites);

  // Find the invite that was used (uses increased by 1)
  let usedCode = null;
  let inviterId = null;

  for (const [code, uses] of newInvites) {
    const old = oldCache.get(code) ?? 0;
    if (uses > old) {
      usedCode = code;
      const fetched = await guild.invites.fetch().catch(() => null);
      const invite = fetched?.get(code);
      inviterId = invite?.inviter?.id || null;

      // Sync to DB
      await InviteTracker.findOneAndUpdate(
        { guildId: guild.id, inviteCode: code },
        {
          $set: {
            inviterId: inviterId || 'unknown',
            uses,
            lastUsedAt: new Date(),
          },
        },
        { upsert: true }
      ).catch(() => null);

      break;
    }
  }

  // Log the join
  await InviteJoin.create({
    guildId: guild.id,
    userId: member.id,
    inviteCode: usedCode,
    inviterId,
  }).catch(() => null);
}

async function handleMemberRemove(member) {
  // Refresh cache when someone leaves (invite uses can change with vanity/rejoins)
  await cacheGuildInvites(member.guild).catch(() => null);
}

module.exports = { initAllGuilds, handleGuildCreate, handleMemberAdd, handleMemberRemove };

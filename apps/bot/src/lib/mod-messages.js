/**
 * mod-messages.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Edit this file to customise all moderation responses without touching any
 * command files.
 *
 * Each key matches an action name. Inside you can configure:
 *
 *   dm.title        — Title of the DM embed sent to the moderated user.
 *   dm.description  — Function: (guildName, reason) => string  Body of the DM embed.
 *   dm.color        — Hex colour of the DM embed (e.g. 0xed4245 for red).
 *
 *   auditColor      — Hex colour used for the audit-log embed.
 *
 *   staffReply      — Function: (ctx) => string  Message shown to the moderator.
 *
 * ── Context object (ctx) fields available in staffReply ──────────────────────
 *   targetUser      Discord User object of the moderated user
 *   caseDocument    Mongoose document (caseNumber, type, reason, …)
 *   dmResult        { delivered: bool, suffix: string }
 *   duration        Pre-formatted duration string e.g. "1 hour"
 *   defaultDuration true when mute fell back to the 28-day Discord maximum
 *   channel         Channel object (lock / unlock)
 *   channels        Collection of channels (lockdown)
 *   count           Numeric count (clearnotes)
 *   userId          Raw user-ID string (unban fallback when user cannot be fetched)
 *   role            Role object (temprole / removetemprole / rolepersist)
 *   operation       Subcommand string (rolepersist: "add" | "remove" | "toggle")
 *   enabled         Boolean result of a toggle (rolepersist)
 * ──────────────────────────────────────────────────────────────────────────────
 */

module.exports = {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BAN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ban: {
    dm: {
      title: "You have been banned",
      description: (guildName, reason) =>
        `You have been banned in **${guildName}** for **${reason || "No reason provided"}**.`,
      color: 0xed4245,
    },
    auditColor: 0xed4245,
    staffReply: ({ targetUser, caseDocument, dmResult }) =>
      `✅ ***${targetUser.tag} has been banned*** -- DM ${dmResult.suffix}. Case #${caseDocument.caseNumber}`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // KICK
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  kick: {
    dm: {
      title: "You have been kicked",
      description: (guildName, reason) =>
        `You have been kicked in **${guildName}** for **${reason || "No reason provided"}**.`,
      color: 0xed4245,
    },
    auditColor: 0xed4245,
    staffReply: ({ targetUser, caseDocument, dmResult }) =>
      `✅ ***${targetUser.tag} has been kicked*** -- DM ${dmResult.suffix}. Case #${caseDocument.caseNumber}`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // WARN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  warn: {
    dm: {
      title: "You have been warned",
      description: (guildName, reason) =>
        `You have been warned in **${guildName}** for **${reason || "No reason provided"}**.`,
      color: 0xed4245,
    },
    auditColor: 0xfee75c,
    staffReply: ({ targetUser, caseDocument, dmResult }) =>
      `✅ ***${targetUser.tag} has been warned*** -- DM ${dmResult.suffix}. Case #${caseDocument.caseNumber}`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MUTE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  mute: {
    dm: {
      title: "You have been muted",
      description: (guildName, reason) =>
        `You have been muted in **${guildName}** for **${reason || "No reason provided"}**.`,
      color: 0xed4245,
    },
    auditColor: 0xfee75c,
    staffReply: ({ targetUser, caseDocument, dmResult, defaultDuration }) =>
      `✅ ***${targetUser.tag} has been muted*** -- DM ${dmResult.suffix}. Case #${caseDocument.caseNumber}${defaultDuration ? " *(Defaulted to 28 days — Discord does not support indefinite timeouts.)*" : ""}`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // UNMUTE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  unmute: {
    auditColor: 0x57f287,
    staffReply: ({ targetUser }) =>
      `✅ ***${targetUser.tag} has been unmuted***`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SOFTBAN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  softban: {
    dm: {
      title: "You have been softbanned",
      description: (guildName, reason) =>
        `You have been softbanned in **${guildName}** for **${reason || "No reason provided"}**. Your recent messages have been purged.`,
      color: 0xed4245,
    },
    auditColor: 0xed4245,
    staffReply: ({ targetUser, caseDocument, dmResult }) =>
      `✅ ***${targetUser.tag} has been softbanned*** -- DM ${dmResult.suffix}. Case #${caseDocument.caseNumber}`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // UNBAN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  unban: {
    auditColor: 0x57f287,
    staffReply: ({ targetUser, userId }) =>
      `✅ ***${targetUser ? targetUser.tag : userId} has been unbanned***`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DEAFEN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  deafen: {
    auditColor: 0xfee75c,
    staffReply: ({ targetUser, caseDocument }) =>
      `✅ ***${targetUser.tag} has been deafened*** -- Case #${caseDocument.caseNumber}`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // UNDEAFEN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  undeafen: {
    auditColor: 0x57f287,
    staffReply: ({ targetUser }) =>
      `✅ ***${targetUser.tag} has been undeafened***`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VC MUTE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  vcmute: {
    auditColor: 0xfee75c,
    staffReply: ({ targetUser, caseDocument }) =>
      `✅ ***${targetUser.tag} has been voice muted*** -- Case #${caseDocument.caseNumber}`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VC UNMUTE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  unvcmute: {
    auditColor: 0x57f287,
    staffReply: ({ targetUser }) =>
      `✅ ***${targetUser.tag} has been voice unmuted***`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // NOTE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  note: {
    auditColor: 0x5865f2,
    staffReply: ({ targetUser, caseDocument }) =>
      `✅ ***Note added for ${targetUser.tag}*** -- Case #${caseDocument.caseNumber}`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CLEAR NOTES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  clearnotes: {
    auditColor: 0x57f287,
    staffReply: ({ targetUser, count, caseDocument }) =>
      `✅ ***${count} note${count === 1 ? "" : "s"} cleared for ${targetUser.tag}*** -- Case #${caseDocument.caseNumber}`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // EDIT NOTE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  editnote: {
    auditColor: 0x5865f2,
    staffReply: ({ caseDocument }) =>
      `✅ ***Note case #${caseDocument.caseNumber} has been edited***`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DELETE WARN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  delwarn: {
    auditColor: 0x57f287,
    staffReply: ({ caseDocument }) =>
      `✅ ***Warning case #${caseDocument.caseNumber} has been removed***`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // UNWARN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  unwarn: {
    auditColor: 0x57f287,
    staffReply: ({ caseDocument }) =>
      `✅ ***Warning case #${caseDocument.caseNumber} has been removed***`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // REASON
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  reason: {
    auditColor: 0x5865f2,
    staffReply: ({ caseDocument }) =>
      `✅ ***Reason updated for case #${caseDocument.caseNumber}***`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DURATION
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  duration: {
    auditColor: 0x5865f2,
    staffReply: ({ caseDocument, duration }) =>
      `✅ ***Case #${caseDocument.caseNumber} updated to ${duration}***`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RETIME
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  retime: {
    auditColor: 0x5865f2,
    staffReply: ({ caseDocument, duration }) =>
      `✅ ***Case #${caseDocument.caseNumber} retimed to ${duration}***`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // LOCK
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  lock: {
    auditColor: 0xfee75c,
    staffReply: ({ channel, caseDocument }) =>
      `✅ ***<#${channel.id}> has been locked*** -- Case #${caseDocument.caseNumber}`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // UNLOCK
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  unlock: {
    auditColor: 0x57f287,
    staffReply: ({ channel }) =>
      `✅ ***<#${channel.id}> has been unlocked***`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // LOCKDOWN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  lockdown: {
    auditColor: 0xed4245,
    staffReply: ({ channels, caseDocument }) =>
      `✅ ***${channels.size} channel${channels.size === 1 ? "" : "s"} locked down*** -- Case #${caseDocument.caseNumber}`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TEMPROLE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  temprole: {
    auditColor: 0x57f287,
    staffReply: ({ targetUser, caseDocument, role }) =>
      `✅ ***${role.name} assigned to ${targetUser.tag}*** -- Case #${caseDocument.caseNumber}`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // REMOVE TEMPROLE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  removetemprole: {
    auditColor: 0x57f287,
    staffReply: ({ targetUser, role }) =>
      `✅ ***${role.name} removed from ${targetUser.tag}***`,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ROLEPERSIST
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  rolepersist: {
    auditColor: 0x57f287,
    staffReply: ({ targetUser, caseDocument, role, operation, enabled }) => {
      const verb =
        operation === "toggle"
          ? enabled ? "enabled" : "disabled"
          : operation === "add" ? "enabled" : "removed";
      return `✅ ***Persistent role ${role.name} ${verb} for ${targetUser.tag}*** -- Case #${caseDocument.caseNumber}`;
    },
  },
};

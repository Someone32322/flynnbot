const { getPersistentRoles } = require("../lib/moderation");
const { handleMemberJoin } = require("../lib/welcome");
const { trackEvent } = require("../lib/analytics");
const inviteTracker = require("../lib/inviteTracker");

module.exports = {
  name: "guildMemberAdd",
  async execute(member) {
    // Re-apply persistent roles
    const persistentRoles = await getPersistentRoles(member.guild.id, member.id);
    for (const entry of persistentRoles) {
      const role = member.guild.roles.cache.get(entry.roleId);
      if (role && role.editable) {
        await member.roles.add(role, "Persistent role re-applied after rejoin.").catch(() => null);
      }
    }

    // Welcome message + auto-roles + account age check
    handleMemberJoin(member).catch((err) => {
      console.error(`[Welcome] guildMemberAdd error guild=${member.guild.id}`, err?.message || err);
    });

    // Analytics tracking
    trackEvent(member.guild.id, 'join', member.id);

    // Invite tracker
    inviteTracker.handleMemberAdd(member).catch(() => null);
  },
};

const { handleMemberLeave } = require("../lib/welcome");
const { trackEvent } = require("../lib/analytics");
const inviteTracker = require("../lib/inviteTracker");
const commandEngine = require("../lib/commandEngine/hooks");

module.exports = {
  name: "guildMemberRemove",
  async execute(member) {
    // ── Command Engine: member_leave triggers ──────────────────
    commandEngine.onMemberLeave(member).catch((err) => {
      console.error('[CommandEngine] member leave error:', err);
    });

    handleMemberLeave(member).catch((err) => {
      console.error(`[Welcome] guildMemberRemove error guild=${member.guild.id}`, err?.message || err);
    });

    trackEvent(member.guild.id, 'leave', member.id);
    inviteTracker.handleMemberRemove(member).catch(() => null);
  },
};

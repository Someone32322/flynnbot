const { handleMemberLeave } = require("../lib/welcome");
const { trackEvent } = require("../lib/analytics");
const inviteTracker = require("../lib/inviteTracker");
const { onMemberLeave: handleWorkflowMemberLeave } = require("../lib/workflow/hooks");

module.exports = {
  name: "guildMemberRemove",
  async execute(member) {
    // ── Workflow member_leave triggers ─────────────────────────
    handleWorkflowMemberLeave(member).catch((err) => {
      console.error('[Workflows] Error handling member leave:', err);
    });

    handleMemberLeave(member).catch((err) => {
      console.error(`[Welcome] guildMemberRemove error guild=${member.guild.id}`, err?.message || err);
    });

    trackEvent(member.guild.id, 'leave', member.id);
    inviteTracker.handleMemberRemove(member).catch(() => null);
  },
};

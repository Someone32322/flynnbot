const { handleMemberLeave } = require("../lib/welcome");
const { trackEvent } = require("../lib/analytics");
const inviteTracker = require("../lib/inviteTracker");

module.exports = {
  name: "guildMemberRemove",
  async execute(member) {
    handleMemberLeave(member).catch((err) => {
      console.error(`[Welcome] guildMemberRemove error guild=${member.guild.id}`, err?.message || err);
    });

    trackEvent(member.guild.id, 'leave', member.id);
    inviteTracker.handleMemberRemove(member).catch(() => null);
  },
};

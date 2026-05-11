const { handleMemberLeave } = require("../lib/welcome");

module.exports = {
  name: "guildMemberRemove",
  async execute(member) {
    handleMemberLeave(member).catch((err) => {
      console.error(`[Welcome] guildMemberRemove error guild=${member.guild.id}`, err?.message || err);
    });
  },
};

const { getPersistentRoles } = require("../lib/moderation");

module.exports = {
  name: "guildMemberAdd",
  async execute(member) {
    const persistentRoles = await getPersistentRoles(member.guild.id, member.id);
    if (persistentRoles.length === 0) {
      return;
    }

    for (const entry of persistentRoles) {
      const role = member.guild.roles.cache.get(entry.roleId);
      if (role && role.editable) {
        await member.roles.add(role, "Persistent role re-applied after rejoin.").catch(() => null);
      }
    }
  },
};

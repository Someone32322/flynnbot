const { ReactionRole } = require("../models/ReactionRole");
const { _executeEmojiAction } = require("./messageReactionAdd");

module.exports = {
  name: "messageReactionRemove",
  async execute(reaction, user, client) {
    if (user.bot) return;

    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }
    if (reaction.message.partial) {
      try { await reaction.message.fetch(); } catch { return; }
    }

    const guildId = reaction.message.guildId;
    if (!guildId) return;

    const emoji = reaction.emoji.id
      ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
      : reaction.emoji.name;

    const rr = await ReactionRole.findOne({
      guildId,
      type: "emoji",
      externalMessageId: reaction.message.id,
    }).catch(() => null);
    if (!rr) return;

    const opt = rr.options.find((o) => o.label === emoji);
    if (!opt) return;

    // isAdd = false → remove the role (if toggleRole)
    await _executeEmojiAction(opt, user.id, reaction.message.guild, false, client);
  },
};

const { ReactionRole } = require("../models/ReactionRole");
const { ScheduledMessage } = require("../models/ScheduledMessage");
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

    // ── Reaction Role (emoji type) ─────────────────────────────
    const rr = await ReactionRole.findOne({
      guildId,
      type: "emoji",
      externalMessageId: reaction.message.id,
    }).catch(() => null);

    if (rr) {
      const opt = rr.options.find((o) => o.label === emoji);
      if (opt) await _executeEmojiAction(opt, user.id, reaction.message.guild, false, client);
      return;
    }

    // ── Message Builder emoji rows ─────────────────────────────
    const sm = await ScheduledMessage.findOne({
      guildId,
      postedMessageId: reaction.message.id,
      "actionRows.rowType": "emoji",
    }).catch(() => null);

    if (!sm) return;

    for (const row of sm.actionRows || []) {
      if (row.rowType !== "emoji") continue;
      const opt = row.options.find((o) => o.label === emoji);
      if (opt) {
        await _executeEmojiAction(opt, user.id, reaction.message.guild, false, client);
        break;
      }
    }
  },
};

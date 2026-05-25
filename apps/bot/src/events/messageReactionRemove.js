const { ReactionRole } = require("../models/ReactionRole");
const { ScheduledMessage } = require("../models/ScheduledMessage");
const { _executeEmojiAction, _emojiMatches } = require("./messageReactionAdd");
const starboard = require("../lib/starboard");
const commandEngine = require("../lib/commandEngine/hooks");

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

    // ── Reaction Role (emoji type) ─────────────────────────────
    const rr = await ReactionRole.findOne({
      guildId,
      type: "emoji",
      $or: [
        { externalMessageId: reaction.message.id },
        { messageId: reaction.message.id },
      ],
    }).catch(() => null);

    if (rr) {
      const opt = rr.options.find((o) => _emojiMatches(o.label, reaction.emoji));
      if (opt) await _executeEmojiAction(opt, user.id, reaction.message.guild, false, client);
      return;
    }

    // ── Message Builder emoji rows ─────────────────────────────
    const sm = await ScheduledMessage.findOne({
      guildId,
      postedMessageId: reaction.message.id,
      "actionRows.rowType": "emoji",
    }).catch(() => null);

    if (!sm) {
      // ── Starboard (remove star) ──────────────────────────────
      await starboard.handleStarReaction(reaction, user, false).catch(() => null);
      return;
    }

    for (const row of sm.actionRows || []) {
      if (row.rowType !== "emoji") continue;
      const opt = row.options.find((o) => _emojiMatches(o.label, reaction.emoji));
      if (opt) {
        await _executeEmojiAction(opt, user.id, reaction.message.guild, false, client);
        break;
      }
    }

    // ── Command Engine: reaction_remove triggers ──────────────
    await commandEngine.onReactionRemove(reaction, user).catch(() => {});
  },
};

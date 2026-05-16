const { ReactionRole } = require("../models/ReactionRole");
const { ScheduledMessage } = require("../models/ScheduledMessage");
const starboard = require("../lib/starboard");
const { onReactionAdd: handleWorkflowReaction } = require("../lib/workflow/hooks");

module.exports = {
  name: "messageReactionAdd",
  async execute(reaction, user, client) {
    if (user.bot) return;

    // Fetch partial reaction/message if needed
    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }
    if (reaction.message.partial) {
      try { await reaction.message.fetch(); } catch { return; }
    }

    const guildId = reaction.message.guildId;
    if (!guildId) return;

    // ── Workflow reaction_add triggers ─────────────────────────
    handleWorkflowReaction(reaction, user).catch((err) => {
      console.error('[Workflows] Error handling reaction:', err);
    });

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
      const opt = rr.options.find((o) => emojiMatches(o.label, reaction.emoji));
      if (opt) await executeEmojiAction(opt, user.id, reaction.message.guild, true, client);
      return;
    }

    // ── Message Builder emoji rows ─────────────────────────────
    const sm = await ScheduledMessage.findOne({
      guildId,
      postedMessageId: reaction.message.id,
      "actionRows.rowType": "emoji",
    }).catch(() => null);

    if (!sm) {
      // ── Starboard ────────────────────────────────────────────
      await starboard.handleStarReaction(reaction, user, true).catch(() => null);
      return;
    }

    for (const row of sm.actionRows || []) {
      if (row.rowType !== "emoji") continue;
      const opt = row.options.find((o) => emojiMatches(o.label, reaction.emoji));
      if (opt) {
        await executeEmojiAction(opt, user.id, reaction.message.guild, true, client);
        break;
      }
    }
  },
};

async function executeEmojiAction(opt, userId, guild, isAdd, client) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  if (opt.action === "role") {
    const role = guild.roles.cache.get(opt.roleId);
    if (!role) return;
    if (isAdd) {
      await member.roles.add(role).catch(() => {});
    } else if (opt.toggleRole) {
      await member.roles.remove(role).catch(() => {});
    }
  } else if (opt.action === "dm") {
    const user = await client.users.fetch(userId).catch(() => null);
    if (user) await user.send(buildDmPayload(opt)).catch(() => {});
  }
  // 'message' action not applicable for emoji reactions (no ephemeral context)
}

function buildDmPayload(opt) {
  const content = String(opt?.content || "").trim() || "No message configured.";
  if (opt?.contentType === "embed") {
    const title = String(opt?.embedTitle || "").trim();
    const description = String(opt?.embedDescription || "").trim() || content;
    const footer = String(opt?.embedFooter || "").trim();
    const color = Number.isFinite(Number(opt?.embedColor)) ? Number(opt.embedColor) : 0x0f52ba;

    const embed = {
      color,
      description,
    };
    if (title) embed.title = title;
    if (footer) embed.footer = { text: footer };
    if (opt?.embedImageUrl) embed.image = { url: opt.embedImageUrl };
    if (opt?.embedThumbnailUrl) embed.thumbnail = { url: opt.embedThumbnailUrl };

    return {
      embeds: [embed],
    };
  }
  return { content };
}

function normalizeEmojiLabel(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;

  const custom = value.match(/^<a?:[^:]+:(\d+)>$/);
  if (custom) return { kind: "custom", id: custom[1] };

  if (/^\d+$/.test(value)) return { kind: "custom", id: value };
  return { kind: "unicode", value };
}

function emojiMatches(storedLabel, reactionEmoji) {
  const parsed = normalizeEmojiLabel(storedLabel);
  if (!parsed || !reactionEmoji) return false;

  if (parsed.kind === "custom") {
    return Boolean(reactionEmoji.id) && String(reactionEmoji.id) === parsed.id;
  }

  return String(reactionEmoji.name || "") === parsed.value;
}

module.exports._executeEmojiAction = executeEmojiAction;
module.exports._emojiMatches = emojiMatches;

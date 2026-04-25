const { ReactionRole } = require("../models/ReactionRole");
const { ScheduledMessage } = require("../models/ScheduledMessage");

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

    // Build emoji string to match stored options
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
      if (opt) await executeEmojiAction(opt, user.id, reaction.message.guild, true, client);
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
    return {
      embeds: [{
        color: 0x0f52ba,
        description: content,
      }],
    };
  }
  return { content };
}

module.exports._executeEmojiAction = executeEmojiAction;


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
    return {
      embeds: [{
        color: 0x0f52ba,
        description: content,
      }],
    };
  }
  return { content };
}

module.exports._executeEmojiAction = executeEmojiAction;

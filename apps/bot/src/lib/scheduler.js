const { GuildConfig } = require("../models/GuildConfig");
const { ModerationCase } = require("../models/ModerationCase");
const { TimedAction } = require("../models/TimedAction");
const { ScheduledMessage } = require("../models/ScheduledMessage");
const { closeCase, logToAuditChannel } = require("./moderation");

async function processTimedAction(client, actionDocument) {
  const guild = client.guilds.cache.get(actionDocument.guildId) || (await client.guilds.fetch(actionDocument.guildId).catch(() => null));
  const caseDocument = await ModerationCase.findById(actionDocument.caseId);

  if (!guild || !caseDocument) {
    actionDocument.active = false;
    await actionDocument.save();
    return;
  }

  const guildConfig = (await GuildConfig.findOne({ guildId: guild.id }).lean()) || { moderation: {} };
  const reason = `Timed moderation expired (case #${caseDocument.caseNumber})`;

  if (actionDocument.actionType === "unban") {
    await guild.members.unban(actionDocument.targetUserId, reason).catch(() => null);
  }

  if (actionDocument.actionType === "unmute") {
    const member = await guild.members.fetch(actionDocument.targetUserId).catch(() => null);
    if (member) {
      await member.timeout(null, reason).catch(() => null);
    }
  }

  if (actionDocument.actionType === "undeafen") {
    const member = await guild.members.fetch(actionDocument.targetUserId).catch(() => null);
    if (member?.voice?.channelId) {
      await member.voice.setDeaf(false, reason).catch(() => null);
    }
  }

  if (actionDocument.actionType === "unvcmute") {
    const member = await guild.members.fetch(actionDocument.targetUserId).catch(() => null);
    if (member?.voice?.channelId) {
      await member.voice.setMute(false, reason).catch(() => null);
    }
  }

  if (actionDocument.actionType === "remove_temprole") {
    const member = await guild.members.fetch(actionDocument.targetUserId).catch(() => null);
    if (member && actionDocument.roleId) {
      await member.roles.remove(actionDocument.roleId, reason).catch(() => null);
    }
  }

  if (actionDocument.actionType === "unlock_channel") {
    const channel = await guild.channels.fetch(actionDocument.channelId).catch(() => null);
    if (channel) {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => null);
    }
  }

  if (actionDocument.actionType === "unlock_lockdown") {
    for (const channelId of actionDocument.channelIds) {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (channel) {
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => null);
      }
    }
  }

  actionDocument.active = false;
  await actionDocument.save();

  if (caseDocument.active) {
    await closeCase(caseDocument, "Expired automatically by scheduler.");
  }

  await logToAuditChannel(
    guild,
    guildConfig,
    "Timed moderation expired",
    [
      { name: "Case", value: `#${caseDocument.caseNumber}`, inline: true },
      { name: "Type", value: caseDocument.type, inline: true },
      { name: "Target", value: `<@${caseDocument.targetUserId}>`, inline: false },
    ],
    0x57f287
  );
}

async function processDueActions(client) {
  const actions = await TimedAction.find({ active: true, executeAt: { $lte: new Date() } }).limit(25);
  for (const actionDocument of actions) {
    await processTimedAction(client, actionDocument);
  }
}

function startScheduler(client) {
  if (client.moderationScheduler) {
    return;
  }

  // Existing moderation timed-action scheduler
  const tick = () => processDueActions(client).catch((error) => console.error("Timed moderation processing failed:", error));
  tick();
  client.moderationScheduler = setInterval(tick, 15_000);
  client.moderationScheduler.unref();

  // Message Builder scheduler — scheduled/repeat messages
  const msgTick = () => runMessageScheduler(client).catch((err) => console.error("[MsgScheduler] Error:", err));
  setTimeout(msgTick, 5_000);  // initial run after 5s on startup
  const msgInterval = setInterval(msgTick, 60_000);
  msgInterval.unref();

  console.log("[Scheduler] Message scheduler started (60-second interval)");
}

// ══════════════════════════════════════════════════════════════════
//  Message Builder scheduler helpers
// ══════════════════════════════════════════════════════════════════

/** Replace {variables} in a string with context values */
function substituteVars(text, ctx) {
  if (!text) return text;
  ctx = ctx || {};

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';

  return text
    .replace(/\{user\}/gi,        ctx.user   ? `<@${ctx.user.id}>` : '')
    .replace(/\{username\}/gi,    ctx.member?.displayName ?? ctx.user?.username ?? 'User')
    .replace(/\{server\}/gi,      ctx.guild?.name      ?? '')
    .replace(/\{serverid\}/gi,    ctx.guild?.id        ?? '')
    .replace(/\{membercount\}/gi, String(ctx.guild?.memberCount ?? 0))
    .replace(/\{date\}/gi,        dateStr)
    .replace(/\{time\}/gi,        timeStr)
    .replace(/\{channel\}/gi,     ctx.channel ? `<#${ctx.channel.id}>` : '');
}

/** Convert a stored embed object into a Discord.js-compatible plain object */
function buildEmbedObj(emb, ctx) {
  const sub = (v) => substituteVars(v, ctx || {});

  const obj = {};
  if (emb.title)       obj.title       = sub(emb.title);
  if (emb.description) obj.description = sub(emb.description);
  if (emb.url)         obj.url         = emb.url;
  if (emb.color !== undefined && emb.color !== null) obj.color = emb.color;

  if (emb.authorName) {
    obj.author = { name: sub(emb.authorName) };
    if (emb.authorIcon) obj.author.iconURL = emb.authorIcon;
    if (emb.authorUrl)  obj.author.url     = emb.authorUrl;
  }

  if (emb.footerText) {
    obj.footer = { text: sub(emb.footerText) };
    if (emb.footerIcon) obj.footer.iconURL = emb.footerIcon;
  }

  if (emb.imageUrl)  obj.image     = { url: emb.imageUrl };
  if (emb.thumbnail) obj.thumbnail = { url: emb.thumbnail };
  if (emb.timestamp) obj.timestamp = new Date();

  if (emb.fields?.length) {
    obj.fields = emb.fields
      .filter((f) => f.name && f.value)
      .map((f) => ({ name: sub(f.name), value: sub(f.value), inline: f.inline || false }));
  }

  return obj;
}

/** Build the full send payload for a ScheduledMessage doc */
function buildMessagePayload(msg, ctx) {
  ctx = ctx || {};
  const content = substituteVars(msg.content || '', ctx) || undefined;
  const embeds  = (msg.embeds || [])
    .map((emb) => buildEmbedObj(emb, ctx))
    .filter((e) => Object.keys(e).length > 0);

  const payload = {};
  if (content)       payload.content = content;
  if (embeds.length) payload.embeds  = embeds;

  // Include action row components (buttons / select menus)
  const components = buildARComponents(msg);
  if (components.length) payload.components = components;

  return payload;
}

/** Safely send to a text channel */
async function sendToChannel(client, channelId, payload) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    console.warn(`[MsgScheduler] Channel ${channelId} not found or not text-based`);
    return null;
  }
  return channel.send(payload).catch((err) => {
    console.error(`[MsgScheduler] Failed to send to ${channelId}:`, err.message);
    return null;
  });
}

/** Seed emoji reactions on a message for emoji-type action rows */
async function seedEmojiReactions(msg, sentMessage) {
  if (!sentMessage) return;
  for (const row of msg.actionRows || []) {
    if (row.rowType !== 'emoji') continue;
    for (const opt of row.options || []) {
      if (opt.label) {
        await sentMessage.react(opt.label).catch(() => {});
      }
    }
  }
}

/** Build Discord component rows from ScheduledMessage action rows */
function buildARComponents(msg) {
  const styleMap = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 };
  const components = [];
  const msgId = String(msg._id);

  for (const row of (msg.actionRows || []).slice(0, 5)) {
    if (row.rowType === 'emoji') continue;

    if (row.rowType === 'button') {
      const buttons = (row.options || []).slice(0, 5)
        .filter((o) => o.label)
        .map((opt) => {
          const style = styleMap[opt.style] || 1;
          const btn = { type: 2, label: opt.label, style };
          if (style === 5) {
            btn.url = opt.url || 'https://discord.com';
          } else {
            btn.customId = `msg:btn:${msgId}:${opt.optId}`;
          }
          if (opt.emoji) btn.emoji = opt.emoji;
          return btn;
        });
      if (buttons.length) components.push({ type: 1, components: buttons });
    } else if (row.rowType === 'select') {
      const options = (row.options || []).slice(0, 25)
        .filter((o) => o.label)
        .map((opt) => {
          const o = { label: opt.label, value: opt.optId };
          if (opt.description) o.description = opt.description;
          if (opt.emoji) o.emoji = opt.emoji;
          return o;
        });
      if (options.length) {
        components.push({
          type: 1,
          components: [{
            type: 3,
            customId: `msg:sel:${msgId}:${row.rowId}`,
            placeholder: row.placeholder || 'Select an option…',
            minValues: 1,
            maxValues: 1,
            options,
          }],
        });
      }
    }
  }
  return components;
}

/** Run pending schedule_once / schedule_repeat messages */
async function runMessageScheduler(client) {
  const now = new Date();

  const pending = await ScheduledMessage.find({
    'delivery.type':            { $in: ['schedule_once', 'schedule_repeat'] },
    'delivery.scheduleEnabled': true,
    'delivery.nextRun':         { $lte: now },
  }).lean();

  for (const msgDoc of pending) {
    // Re-fetch for atomic write
    const msg = await ScheduledMessage.findById(msgDoc._id);
    if (!msg || !msg.delivery.scheduleEnabled) continue;
    if (!msg.delivery.nextRun || msg.delivery.nextRun > now) continue;

    const channelId = msg.delivery.channelId;
    if (!channelId) {
      msg.delivery.scheduleEnabled = false;
      msg.markModified('delivery');
      await msg.save().catch(() => {});
      continue;
    }

    const sent = await sendToChannel(client, channelId, buildMessagePayload(msg));

    // Seed emoji reactions
    if (sent) await seedEmojiReactions(msg, sent);

    // Track posted message for emoji reaction lookups
    if (sent) {
      msg.postedMessageId = sent.id;
      msg.postedChannelId = channelId;
    }

    msg.delivery.lastRun = now;
    if (msg.delivery.type === 'schedule_repeat' && msg.delivery.intervalMins) {
      msg.delivery.nextRun = new Date(now.getTime() + msg.delivery.intervalMins * 60 * 1000);
    } else {
      msg.delivery.scheduleEnabled = false;
      msg.delivery.nextRun         = null;
    }

    msg.markModified('delivery');
    await msg.save().catch((err) => console.error('[MsgScheduler] Save error:', err.message));
  }
}

/**
 * Called from messageCreate.js on every non-bot guild message.
 * Re-posts the sticky message for the channel if one is configured.
 */
async function handleStickyForChannel(client, message) {
  if (!message.guild || message.author.bot) return;

  const sticky = await ScheduledMessage.findOne({
    guildId:              message.guild.id,
    'delivery.type':      'sticky',
    'delivery.channelId': message.channel.id,
  }).catch(() => null);

  if (!sticky) return;

  // Delete previous sticky post if still in channel
  if (sticky.postedMessageId) {
    try {
      const old = await message.channel.messages.fetch(sticky.postedMessageId);
      if (old && old.author.id === client.user.id) await old.delete();
    } catch {
      // Already gone — fine
    }
  }

  const payload = buildMessagePayload(sticky);
  if (!payload.content && !payload.embeds?.length) return;

  const sent = await message.channel.send(payload).catch(() => null);
  if (sent) {
    sticky.postedMessageId = sent.id;
    sticky.postedChannelId = message.channel.id;
    sticky.markModified('postedMessageId');
    await sticky.save().catch(() => {});
    await seedEmojiReactions(sticky, sent);
  }
}

/**
 * Called from messageCreate.js on every non-bot guild message.
 * Checks command triggers and responds if matched.
 */
async function handleCommandTrigger(client, message) {
  if (!message.guild || message.author.bot) return;

  const raw = message.content.trim();
  if (!raw) return;

  const triggers = await ScheduledMessage.find({
    guildId: message.guild.id,
    'delivery.type': { $in: ['command', 'ephemeral', 'dm'] },
  }).lean().catch(() => []);

  for (const msg of triggers) {
    const triggerWord = msg.delivery?.commandTrigger?.trim();
    if (!triggerWord) continue;

    const lowerRaw     = raw.toLowerCase();
    const lowerTrigger = triggerWord.toLowerCase();

    if (lowerRaw !== lowerTrigger && !lowerRaw.startsWith(lowerTrigger + ' ')) continue;

    // Check required role
    const requiredRoleId = msg.delivery.commandRequiredRoleId;
    if (requiredRoleId) {
      const member = message.member
        || await message.guild.members.fetch(message.author.id).catch(() => null);
      if (!member?.roles.cache.has(requiredRoleId)) continue;
    }

    const ctx = {
      user:    message.author,
      member:  message.member,
      guild:   message.guild,
      channel: message.channel,
    };

    const deliveryType = msg.delivery.type;
    
    // For ephemeral/DM, send only embeds (no content/action rows)
    if (deliveryType === 'ephemeral') {
      const embeds = msg.delivery.responseEmbeds || msg.embeds || [];
      if (embeds.length > 0) {
        await message.reply({ embeds, flags: 'Ephemeral' }).catch(() => {});
      }
    } else if (deliveryType === 'dm') {
      const embeds = msg.delivery.responseEmbeds || msg.embeds || [];
      if (embeds.length > 0) {
        await message.author.send({ embeds }).catch(() => {});
      }
    } else {
      // Original command trigger (sends to channel or original channel)
      const payload = buildMessagePayload(msg, ctx);
      if (!payload.content && !payload.embeds?.length) continue;

      const targetChannelId = msg.delivery.channelId;
      if (targetChannelId && targetChannelId !== message.channel.id) {
        await sendToChannel(client, targetChannelId, payload);
      } else {
        await message.channel.send(payload).catch(() => {});
      }
    }
  }
}

module.exports = {
  startScheduler,
  handleStickyForChannel,
  handleCommandTrigger,
  buildMessagePayload,
  buildEmbedObj,
};

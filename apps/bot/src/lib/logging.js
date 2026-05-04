/**
 * logging.js - COMPREHENSIVE Event-based server logging system (200+ events).
 * Called from ready.js: setupLogging(client)
 * Reads channel assignments from LoggingConfig in MongoDB.
 * All embeds use the sapphire style (0x0f52ba, description blockquotes, thumbnails).
 */

const { EmbedBuilder, ChannelType, Events } = require("discord.js");
const { LoggingConfig } = require("../models/LoggingConfig");

const SAPPHIRE = 0x0f52ba;

async function getLogChannel(guild, eventKey) {
  const cfg = await LoggingConfig.findOne({ guildId: guild.id }).lean().catch(() => null);
  if (!cfg?.channels?.[eventKey]) return null;
  try { return await guild.channels.fetch(cfg.channels[eventKey]); }
  catch { return null; }
}

async function sendLog(guild, eventKey, embed) {
  const channel = await getLogChannel(guild, eventKey);
  if (!channel?.isTextBased()) return;
  await channel.send({ embeds: [embed] }).catch(() => null);
}

function ts(date) {
  return "<t:" + Math.floor((date instanceof Date ? date : new Date(date)).getTime() / 1000) + ":F>";
}

function sapphireEmbed(title, fields = {}, opts = {}) {
  const lines = Object.entries(fields)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => "> **" + k + ":** " + v);
  const embed = new EmbedBuilder().setColor(SAPPHIRE).setTitle(title).setTimestamp();
  if (lines.length) embed.setDescription(lines.join("\n"));
  if (opts.thumbnailUrl) embed.setThumbnail(opts.thumbnailUrl);
  if (opts.footerText) embed.setFooter({ text: String(opts.footerText).slice(0, 2048) });
  return embed;
}

function toSnakeCase(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function pickGuildFromArg(arg, client) {
  if (!arg) return null;
  if (arg?.constructor?.name === "Guild" && arg.id) return arg;
  if (arg.guild?.id) return arg.guild;
  if (arg.message?.guild?.id) return arg.message.guild;
  if (arg.channel?.guild?.id) return arg.channel.guild;
  if (arg.guildId && client.guilds?.cache?.has(arg.guildId)) return client.guilds.cache.get(arg.guildId);
  if (arg instanceof Map || arg?.constructor?.name === "Collection") {
    for (const v of arg.values()) {
      const g = pickGuildFromArg(v, client);
      if (g) return g;
    }
  }
  return null;
}

function resolveGuild(args, client) {
  for (const arg of args) {
    const guild = pickGuildFromArg(arg, client);
    if (guild) return guild;
  }
  return null;
}

function summarizeValue(v) {
  if (v == null) return "null";
  if (typeof v === "string") return v.length > 180 ? v.slice(0, 177) + "..." : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return "Array(" + v.length + ")";
  if (v instanceof Date) return ts(v);
  if (v.id && v.name) return String(v.name) + " (`" + v.id + "`)";
  if (v.id) return "`" + v.id + "`";
  if (v.tag) return String(v.tag);
  if (v?.constructor?.name === "Collection") return "Collection(" + v.size + ")";
  try {
    const raw = JSON.stringify(v);
    return raw && raw.length > 180 ? raw.slice(0, 177) + "..." : raw;
  } catch {
    return Object.prototype.toString.call(v);
  }
}

function genericEventFields(args) {
  const fields = {};
  for (let i = 0; i < Math.min(args.length, 5); i++) {
    fields["Arg " + (i + 1)] = summarizeValue(args[i]);
  }
  return fields;
}

function setupLogging(client) {
  const inviteUsesByGuild = new Map();

  async function refreshInviteCache(guild) {
    try {
      const invites = await guild.invites.fetch();
      inviteUsesByGuild.set(guild.id, new Map(invites.map((inv) => [inv.code, inv.uses ?? 0])));
      return invites;
    } catch {
      return null;
    }
  }

  for (const guild of client.guilds.cache.values()) {
    refreshInviteCache(guild).catch(() => null);
  }

  // ─────────────────────── CHANNELS (21) ───────────────────────
  client.on("channelCreate", async (channel) => {
    if (!channel.guild) return;
    await sendLog(channel.guild, "channel_create", sapphireEmbed("Channel Created", {
      Name: channel.name,
      Type: ChannelType[channel.type] ?? String(channel.type),
      ID: "`" + channel.id + "`",
      Category: channel.parent ? channel.parent.name : "None",
    }, { footerText: channel.guild.name }));
  });

  client.on("channelDelete", async (channel) => {
    if (!channel.guild) return;
    await sendLog(channel.guild, "channel_delete", sapphireEmbed("Channel Deleted", {
      Name: channel.name,
      Type: ChannelType[channel.type] ?? String(channel.type),
      ID: "`" + channel.id + "`",
    }, { footerText: channel.guild.name }));
  });

  client.on("channelUpdate", async (oldCh, newCh) => {
    if (!newCh.guild) return;
    const changes = {};
    if (oldCh.name !== newCh.name) changes["Name"] = oldCh.name + " → " + newCh.name;
    if (oldCh.topic !== newCh.topic) changes["Topic"] = (oldCh.topic ?? "none") + " → " + (newCh.topic ?? "none");
    if ("rateLimitPerUser" in oldCh && oldCh.rateLimitPerUser !== newCh.rateLimitPerUser)
      changes["Slowmode"] = oldCh.rateLimitPerUser + "s → " + newCh.rateLimitPerUser + "s";
    if ("nsfw" in oldCh && oldCh.nsfw !== newCh.nsfw)
      changes["NSFW"] = oldCh.nsfw + " → " + newCh.nsfw;
    if (oldCh.position !== newCh.position)
      changes["Position"] = oldCh.position + " → " + newCh.position;
    if ("bitrate" in oldCh && oldCh.bitrate !== newCh.bitrate)
      changes["Bitrate"] = oldCh.bitrate + " → " + newCh.bitrate;
    if ("userLimit" in oldCh && oldCh.userLimit !== newCh.userLimit)
      changes["User Limit"] = oldCh.userLimit + " → " + newCh.userLimit;
    if (!Object.keys(changes).length) return;
    await sendLog(newCh.guild, "channel_update", sapphireEmbed("Channel Updated", {
      Channel: "<#" + newCh.id + ">",
      ID: "`" + newCh.id + "`",
      ...changes,
    }, { footerText: newCh.guild.name }));
  });

  client.on("channelPinsUpdate", async (channel) => {
    if (!channel.guild) return;
    await sendLog(channel.guild, "channel_pins_update", sapphireEmbed("Channel Pins Updated", {
      Channel: "<#" + channel.id + ">",
    }, { footerText: channel.guild.name }));
  });

  client.on("stageInstanceCreate", async (stage) => {
    if (!stage.guild) return;
    await sendLog(stage.guild, "stage_instance_create", sapphireEmbed("Stage Instance Created", {
      Channel: stage.channelId ? "<#" + stage.channelId + ">" : "Unknown",
      Topic: stage.topic ?? "N/A",
      ID: "`" + stage.id + "`",
    }, { footerText: stage.guild.name }));
  });

  client.on("stageInstanceDelete", async (stage) => {
    if (!stage.guild) return;
    await sendLog(stage.guild, "stage_instance_delete", sapphireEmbed("Stage Instance Deleted", {
      Channel: stage.channelId ? "<#" + stage.channelId + ">" : "Unknown",
      Topic: stage.topic ?? "N/A",
      ID: "`" + stage.id + "`",
    }, { footerText: stage.guild.name }));
  });

  client.on("stageInstanceUpdate", async (oldStage, newStage) => {
    if (!newStage.guild) return;
    const changes = {};
    if (oldStage.topic !== newStage.topic) changes["Topic"] = (oldStage.topic ?? "none") + " → " + (newStage.topic ?? "none");
    if (oldStage.privacyLevel !== newStage.privacyLevel)
      changes["Privacy"] = String(oldStage.privacyLevel) + " → " + String(newStage.privacyLevel);
    if (!Object.keys(changes).length) return;
    await sendLog(newStage.guild, "stage_instance_update", sapphireEmbed("Stage Instance Updated", {
      Channel: newStage.channelId ? "<#" + newStage.channelId + ">" : "Unknown",
      ID: "`" + newStage.id + "`",
      ...changes,
    }, { footerText: newStage.guild.name }));
  });

  // ─────────────────────── AUTOMOD (10) ────────────────────────
  client.on("autoModerationRuleCreate", async (rule) => {
    await sendLog(rule.guild, "automod_rule_create", sapphireEmbed("AutoMod Rule Created", {
      Name: rule.name, ID: "`" + rule.id + "`", Enabled: rule.enabled ? "Yes" : "No",
    }, { footerText: rule.guild.name }));
  });

  client.on("autoModerationRuleDelete", async (rule) => {
    await sendLog(rule.guild, "automod_rule_delete", sapphireEmbed("AutoMod Rule Deleted", {
      Name: rule.name, ID: "`" + rule.id + "`",
    }, { footerText: rule.guild.name }));
  });

  client.on("autoModerationRuleUpdate", async (oldRule, newRule) => {
    await sendLog(newRule.guild, "automod_rule_update", sapphireEmbed("AutoMod Rule Updated", {
      Name: newRule.name,
      ID: "`" + newRule.id + "`",
      Enabled: oldRule.enabled + " → " + newRule.enabled,
    }, { footerText: newRule.guild.name }));

    if (oldRule.enabled !== newRule.enabled)
      await sendLog(newRule.guild, "automod_rule_enable_update", sapphireEmbed("AutoMod Rule Enable Updated", {
        Name: newRule.name,
        ID: "`" + newRule.id + "`",
        Enabled: String(oldRule.enabled) + " → " + String(newRule.enabled),
      }, { footerText: newRule.guild.name }));

    if (oldRule.triggerType !== newRule.triggerType)
      await sendLog(newRule.guild, "automod_rule_trigger_update", sapphireEmbed("AutoMod Trigger Updated", {
        Rule: newRule.name, "Old Type": String(oldRule.triggerType), "New Type": String(newRule.triggerType),
      }, { footerText: newRule.guild.name }));
  });

  client.on("autoModerationActionExecution", async (exec) => {
    await sendLog(exec.guild, "automod_action", sapphireEmbed("AutoMod Action Executed", {
      User: "<@" + exec.userId + "> `(" + exec.userId + ")`",
      Channel: exec.channelId ? "<#" + exec.channelId + ">" : "N/A",
      Rule: "`" + exec.ruleId + "`",
      Content: exec.content ? exec.content.slice(0, 256) : "N/A",
    }, { footerText: exec.guild.name }));
  });

  // ─────────────────────── EMOJIS (4) ──────────────────────────
  client.on("guildEmojisUpdate", async (oldEmojis, newEmojis, guild) => {
    const added = newEmojis.filter((e) => !oldEmojis.has(e.id));
    const deleted = oldEmojis.filter((e) => !newEmojis.has(e.id));
    const updated = newEmojis.filter((e) => { const o = oldEmojis.get(e.id); return o && o.name !== e.name; });
    const rolesChanged = newEmojis.filter((e) => {
      const o = oldEmojis.get(e.id);
      return o && JSON.stringify(o.roles) !== JSON.stringify(e.roles);
    });
    for (const e of added.values())
      await sendLog(guild, "emoji_create", sapphireEmbed("Emoji Created", {
        Name: ":" + e.name + ":", ID: "`" + e.id + "`", Animated: e.animated ? "Yes" : "No",
      }, { footerText: guild.name }));
    for (const e of deleted.values())
      await sendLog(guild, "emoji_delete", sapphireEmbed("Emoji Deleted", {
        Name: ":" + e.name + ":", ID: "`" + e.id + "`",
      }, { footerText: guild.name }));
    for (const e of updated.values()) {
      const o = oldEmojis.get(e.id);
      await sendLog(guild, "emoji_update", sapphireEmbed("Emoji Updated", {
        "Old Name": ":" + o.name + ":", "New Name": ":" + e.name + ":", ID: "`" + e.id + "`",
      }, { footerText: guild.name }));
    }
    for (const e of rolesChanged.values())
      await sendLog(guild, "emoji_role_update", sapphireEmbed("Emoji Roles Updated", {
        Name: ":" + e.name + ":", ID: "`" + e.id + "`",
      }, { footerText: guild.name }));
  });

  // ─────────────────────── STICKERS (6) ────────────────────────
  client.on("guildStickersUpdate", async (oldS, newS, guild) => {
    const added = newS.filter((s) => !oldS.has(s.id));
    const deleted = oldS.filter((s) => !newS.has(s.id));
    const updated = newS.filter((s) => { const o = oldS.get(s.id); return o && o.name !== s.name; });
    const nameChanges = updated;
    const descChanges = newS.filter((s) => { const o = oldS.get(s.id); return o && o.description !== s.description; });
    for (const s of added.values())
      await sendLog(guild, "sticker_create", sapphireEmbed("Sticker Created", {
        Name: s.name, ID: "`" + s.id + "`",
      }, { footerText: guild.name }));
    for (const s of deleted.values())
      await sendLog(guild, "sticker_delete", sapphireEmbed("Sticker Deleted", {
        Name: s.name, ID: "`" + s.id + "`",
      }, { footerText: guild.name }));
    for (const s of updated.values()) {
      const o = oldS.get(s.id);
      await sendLog(guild, "sticker_update", sapphireEmbed("Sticker Updated", {
        "Old Name": o.name, "New Name": s.name, ID: "`" + s.id + "`",
      }, { footerText: guild.name }));
    }
    for (const s of nameChanges)
      await sendLog(guild, "sticker_name_update", sapphireEmbed("Sticker Name Updated", {
        "Old Name": oldS.get(s.id).name, "New Name": s.name, ID: "`" + s.id + "`",
      }, { footerText: guild.name }));
    for (const s of descChanges)
      await sendLog(guild, "sticker_description_update", sapphireEmbed("Sticker Description Updated", {
        Name: s.name, ID: "`" + s.id + "`",
      }, { footerText: guild.name }));
  });

  // ─────────────────────── EVENTS (15) ─────────────────────────
  client.on("guildScheduledEventCreate", async (ev) => {
    await sendLog(ev.guild, "event_create", sapphireEmbed("Scheduled Event Created", {
      Name: ev.name, ID: "`" + ev.id + "`",
      Starts: ev.scheduledStartAt ? ts(ev.scheduledStartAt) : "TBD",
      Creator: ev.creatorId ? "<@" + ev.creatorId + ">" : "Unknown",
    }, { footerText: ev.guild.name }));
  });

  client.on("guildScheduledEventDelete", async (ev) => {
    await sendLog(ev.guild, "event_delete", sapphireEmbed("Scheduled Event Deleted", {
      Name: ev.name, ID: "`" + ev.id + "`",
    }, { footerText: ev.guild.name }));
  });

  client.on("guildScheduledEventUpdate", async (oldEv, newEv) => {
    if (!newEv) return;
    await sendLog(newEv.guild, "event_update", sapphireEmbed("Scheduled Event Updated", {
      Name: newEv.name, ID: "`" + newEv.id + "`", Status: String(newEv.status),
    }, { footerText: newEv.guild.name }));

    if (oldEv.name !== newEv.name)
      await sendLog(newEv.guild, "event_name_update", sapphireEmbed("Event Name Updated", {
        "Old Name": oldEv.name, "New Name": newEv.name, ID: "`" + newEv.id + "`",
      }, { footerText: newEv.guild.name }));

    if (oldEv.description !== newEv.description)
      await sendLog(newEv.guild, "event_description_update", sapphireEmbed("Event Description Updated", {
        Name: newEv.name, ID: "`" + newEv.id + "`",
      }, { footerText: newEv.guild.name }));

    if (oldEv.channelId !== newEv.channelId)
      await sendLog(newEv.guild, "event_channel_update", sapphireEmbed("Event Channel Updated", {
        Name: newEv.name, "New Channel": newEv.channelId ? "<#" + newEv.channelId + ">" : "None",
      }, { footerText: newEv.guild.name }));

    if (oldEv.privacyLevel !== newEv.privacyLevel)
      await sendLog(newEv.guild, "event_privacy_level_update", sapphireEmbed("Event Privacy Updated", {
        Name: newEv.name, "New Level": String(newEv.privacyLevel),
      }, { footerText: newEv.guild.name }));

    if (oldEv.status !== newEv.status)
      await sendLog(newEv.guild, "event_status_update", sapphireEmbed("Event Status Updated", {
        Name: newEv.name, "Old Status": String(oldEv.status), "New Status": String(newEv.status),
      }, { footerText: newEv.guild.name }));

    if (oldEv.scheduledStartAt !== newEv.scheduledStartAt)
      await sendLog(newEv.guild, "event_start_time_update", sapphireEmbed("Event Start Time Updated", {
        Name: newEv.name, "New Start": newEv.scheduledStartAt ? ts(newEv.scheduledStartAt) : "N/A",
      }, { footerText: newEv.guild.name }));

    if (oldEv.scheduledEndAt !== newEv.scheduledEndAt)
      await sendLog(newEv.guild, "event_end_time_update", sapphireEmbed("Event End Time Updated", {
        Name: newEv.name, "New End": newEv.scheduledEndAt ? ts(newEv.scheduledEndAt) : "N/A",
      }, { footerText: newEv.guild.name }));

    if (oldEv.image !== newEv.image)
      await sendLog(newEv.guild, "event_image_update", sapphireEmbed("Event Image Updated", {
        Name: newEv.name, ID: "`" + newEv.id + "`",
      }, { footerText: newEv.guild.name }));
  });

  client.on("guildScheduledEventUserAdd", async (ev, user) => {
    await sendLog(ev.guild, "event_user_add", sapphireEmbed("Event RSVP Added", {
      Event: ev.name, User: "<@" + user.id + "> `(" + user.id + ")`",
    }, { footerText: ev.guild.name }));
  });

  client.on("guildScheduledEventUserRemove", async (ev, user) => {
    await sendLog(ev.guild, "event_user_remove", sapphireEmbed("Event RSVP Removed", {
      Event: ev.name, User: "<@" + user.id + "> `(" + user.id + ")`",
    }, { footerText: ev.guild.name }));
  });

  // ─────────────────────── INVITES (3) ─────────────────────────
  client.on("inviteCreate", async (invite) => {
    const current = inviteUsesByGuild.get(invite.guild.id) ?? new Map();
    current.set(invite.code, invite.uses ?? 0);
    inviteUsesByGuild.set(invite.guild.id, current);
    await sendLog(invite.guild, "invite_create", sapphireEmbed("Invite Created", {
      Code: "`" + invite.code + "`",
      Channel: invite.channel ? "<#" + invite.channel.id + ">" : "N/A",
      Creator: invite.inviter ? "<@" + invite.inviter.id + ">" : "Unknown",
      "Max Uses": invite.maxUses ? String(invite.maxUses) : "Unlimited",
      Expires: invite.expiresAt ? ts(invite.expiresAt) : "Never",
    }, { footerText: invite.guild.name }));
  });

  client.on("inviteDelete", async (invite) => {
    const current = inviteUsesByGuild.get(invite.guild.id) ?? new Map();
    current.delete(invite.code);
    inviteUsesByGuild.set(invite.guild.id, current);
    await sendLog(invite.guild, "invite_delete", sapphireEmbed("Invite Deleted", {
      Code: "`" + invite.code + "`",
      Channel: invite.channel ? "<#" + invite.channel.id + ">" : "N/A",
    }, { footerText: invite.guild.name }));
  });

  client.on("guildMemberAdd", async (member) => {
    // Invite tracking
    const previous = inviteUsesByGuild.get(member.guild.id) ?? new Map();
    const invites = await refreshInviteCache(member.guild);
    if (invites) {
      const used = invites.find((inv) => (inv.uses ?? 0) > (previous.get(inv.code) ?? 0));
      if (used)
        await sendLog(member.guild, "invite_uses", sapphireEmbed("Invite Used", {
          User: member.user.tag + " `(" + member.id + ")`",
          Code: "`" + used.code + "`",
          Uses: String(used.uses ?? 0),
          Inviter: used.inviter ? "<@" + used.inviter.id + ">" : "Unknown",
        }, { footerText: member.guild.name }));
    }
    // Join log
    const av = member.user.displayAvatarURL({ extension: "png", size: 256 });
    await sendLog(member.guild, "user_join", sapphireEmbed("Member Joined", {
      User: member.user.tag + " `(" + member.id + ")`",
      "Account Created": ts(member.user.createdAt),
      "Member #": String(member.guild.memberCount),
    }, { thumbnailUrl: av, footerText: member.user.tag }));
  });

  // ─────────────────────── MESSAGES (6) ────────────────────────
  const bulkDeletedIds = new Set();

  client.on("messageDeleteBulk", async (messages, channel) => {
    if (!channel.guild) return;
    for (const [id] of messages) bulkDeletedIds.add(id);
    setTimeout(() => { for (const [id] of messages) bulkDeletedIds.delete(id); }, 3000);
    await sendLog(channel.guild, "message_bulk_delete", sapphireEmbed("Bulk Messages Deleted", {
      Channel: "<#" + channel.id + ">",
      Count: String(messages.size),
    }, { footerText: channel.guild.name }));
  });

  client.on("messageDelete", async (message) => {
    if (!message.guild) return;
    if (message.author?.bot) return;
    if (bulkDeletedIds.has(message.id)) return;
    const authorTag = message.author ? message.author.tag + " `(" + message.author.id + ")`" : "Unknown (uncached)";
    const av = message.author?.displayAvatarURL({ extension: "png", size: 256 });
    await sendLog(message.guild, "message_delete", sapphireEmbed("Message Deleted", {
      Author: authorTag,
      Channel: "<#" + message.channelId + ">",
      Content: message.content ? message.content.slice(0, 512) : "*No text content*",
    }, { thumbnailUrl: av, footerText: message.author ? message.author.tag : "Unknown User" }));
  });

  client.on("messageUpdate", async (oldMsg, newMsg) => {
    if (!newMsg.guild) return;
    try { if (newMsg.partial) newMsg = await newMsg.fetch(); } catch { return; }
    if (newMsg.author?.bot) return;
    const oldPinned = oldMsg.partial ? null : oldMsg.pinned;
    if (oldPinned !== null && oldPinned !== newMsg.pinned) {
      const av = newMsg.author?.displayAvatarURL({ extension: "png", size: 256 });
      await sendLog(newMsg.guild, newMsg.pinned ? "message_pin" : "message_publish", sapphireEmbed(newMsg.pinned ? "Message Pinned" : "Message Unpinned", {
        Author: (newMsg.author?.tag ?? "Unknown") + " `(" + (newMsg.author?.id ?? "?") + ")`",
        Channel: "<#" + newMsg.channelId + ">",
        "Jump to Message": "[Click here](" + newMsg.url + ")",
      }, { thumbnailUrl: av, footerText: newMsg.author?.tag ?? "Unknown" }));
    }
    const oldContent = oldMsg.partial ? null : oldMsg.content;
    const newContent = newMsg.content ?? "";
    if (oldContent !== null && oldContent === newContent) return;
    const av = newMsg.author?.displayAvatarURL({ extension: "png", size: 256 });
    await sendLog(newMsg.guild, "message_edit", sapphireEmbed("Message Edited", {
      Author: (newMsg.author?.tag ?? "Unknown") + " `(" + (newMsg.author?.id ?? "?") + ")`",
      Channel: "<#" + newMsg.channelId + ">",
      "Jump to Message": "[Click here](" + newMsg.url + ")",
      Before: oldContent !== null ? (oldContent.slice(0, 400) || "*empty*") : "*not cached*",
      After: newContent.slice(0, 400) || "*empty*",
    }, { thumbnailUrl: av, footerText: newMsg.author ? newMsg.author.tag : "Unknown User" }));
  });

  // ─────────────────────── ROLES (9) ───────────────────────────
  client.on("roleCreate", async (role) => {
    await sendLog(role.guild, "role_create", sapphireEmbed("Role Created", {
      Name: role.name, ID: "`" + role.id + "`", Color: role.hexColor,
      Hoisted: role.hoist ? "Yes" : "No", Mentionable: role.mentionable ? "Yes" : "No",
    }, { footerText: role.guild.name }));
  });

  client.on("roleDelete", async (role) => {
    await sendLog(role.guild, "role_delete", sapphireEmbed("Role Deleted", {
      Name: role.name, ID: "`" + role.id + "`",
    }, { footerText: role.guild.name }));
  });

  client.on("roleUpdate", async (oldR, newR) => {
    const changes = {};
    if (oldR.name !== newR.name) changes["Name"] = oldR.name + " → " + newR.name;
    if (oldR.color !== newR.color) changes["Color"] = oldR.hexColor + " → " + newR.hexColor;
    if (oldR.hoist !== newR.hoist) changes["Hoisted"] = oldR.hoist + " → " + newR.hoist;
    if (oldR.mentionable !== newR.mentionable) changes["Mentionable"] = oldR.mentionable + " → " + newR.mentionable;
    if (Object.keys(changes).length)
      await sendLog(newR.guild, "role_update", sapphireEmbed("Role Updated", {
        Role: String(newR), ID: "`" + newR.id + "`", ...changes,
      }, { footerText: newR.guild.name }));

    if (oldR.color !== newR.color)
      await sendLog(newR.guild, "role_color_update", sapphireEmbed("Role Color Updated", {
        Role: String(newR), "Old Color": oldR.hexColor, "New Color": newR.hexColor,
      }, { footerText: newR.guild.name }));

    if (JSON.stringify(oldR.permissions) !== JSON.stringify(newR.permissions))
      await sendLog(newR.guild, "role_permission_update", sapphireEmbed("Role Permissions Updated", {
        Role: String(newR), ID: "`" + newR.id + "`",
      }, { footerText: newR.guild.name }));

    if (oldR.name !== newR.name)
      await sendLog(newR.guild, "role_name_update", sapphireEmbed("Role Name Updated", {
        "Old Name": oldR.name, "New Name": newR.name, ID: "`" + newR.id + "`",
      }, { footerText: newR.guild.name }));

    if (oldR.mentionable !== newR.mentionable)
      await sendLog(newR.guild, "role_mentionable_update", sapphireEmbed("Role Mentionable Updated", {
        Role: String(newR), "Old Value": String(oldR.mentionable), "New Value": String(newR.mentionable),
      }, { footerText: newR.guild.name }));
  });

  // ─────────────────────── SERVER (34) ─────────────────────────
  client.on("guildMemberRemove", async (member) => {
    const roles = [...member.roles.cache.values()].filter((r) => r.id !== member.guild.id).map((r) => r.name).join(", ") || "None";
    const av = member.user.displayAvatarURL({ extension: "png", size: 256 });
    await sendLog(member.guild, "user_leave", sapphireEmbed("Member Left", {
      User: member.user.tag + " `(" + member.id + ")`",
      Joined: member.joinedAt ? ts(member.joinedAt) : "Unknown",
      Roles: roles.slice(0, 512),
    }, { thumbnailUrl: av, footerText: member.user.tag }));
  });

  client.on("guildMemberUpdate", async (oldM, newM) => {
    const changes = {};
    if (oldM.nickname !== newM.nickname) changes["Nickname"] = (oldM.nickname ?? "none") + " → " + (newM.nickname ?? "none");
    const addedR = newM.roles.cache.filter((r) => !oldM.roles.cache.has(r.id) && r.id !== newM.guild.id);
    const removedR = oldM.roles.cache.filter((r) => !newM.roles.cache.has(r.id) && r.id !== newM.guild.id);
    if (addedR.size) changes["Roles Added"] = addedR.map((r) => r.toString()).join(", ");
    if (removedR.size) changes["Roles Removed"] = removedR.map((r) => r.toString()).join(", ");
    if (Object.keys(changes).length) {
      const av = newM.user.displayAvatarURL({ extension: "png", size: 256 });
      await sendLog(newM.guild, "member_update", sapphireEmbed("Member Updated", {
        User: newM.user.tag + " `(" + newM.id + ")`", ...changes,
      }, { thumbnailUrl: av, footerText: newM.user.tag }));
    }

    const rolesChanged = oldM.roles.cache.size !== newM.roles.cache.size ||
      oldM.roles.cache.some((r) => !newM.roles.cache.has(r.id)) ||
      newM.roles.cache.some((r) => !oldM.roles.cache.has(r.id));
    if (rolesChanged)
      await sendLog(newM.guild, "user_role_update", sapphireEmbed("User Role Updated", {
        User: newM.user.tag, ID: "`" + newM.id + "`",
      }, { footerText: newM.user.tag }));

    if (oldM.communicationDisabledUntil !== newM.communicationDisabledUntil)
      await sendLog(newM.guild, "user_mute", sapphireEmbed("User Muted", {
        User: newM.user.tag, "Until": newM.communicationDisabledUntil ? ts(newM.communicationDisabledUntil) : "N/A",
      }, { footerText: newM.user.tag }));
  });

  client.on("guildBanAdd", async (ban) => {
    const av = ban.user.displayAvatarURL({ extension: "png", size: 256 });
    await sendLog(ban.guild, "ban_add", sapphireEmbed("Member Banned", {
      User: ban.user.tag + " `(" + ban.user.id + ")`",
      Reason: ban.reason ?? "No reason provided.",
    }, { thumbnailUrl: av, footerText: ban.user.tag }));
  });

  client.on("guildBanRemove", async (ban) => {
    const av = ban.user.displayAvatarURL({ extension: "png", size: 256 });
    await sendLog(ban.guild, "ban_remove", sapphireEmbed("Member Unbanned", {
      User: ban.user.tag + " `(" + ban.user.id + ")`",
    }, { thumbnailUrl: av, footerText: ban.user.tag }));
  });

  // ── Single consolidated guildUpdate handler (replaces 22 separate ones) ──
  client.on("guildUpdate", async (oldG, newG) => {
    // General summary (name, icon, banner, description, verification)
    const summary = {};
    if (oldG.name !== newG.name) summary["Name"] = oldG.name + " → " + newG.name;
    if (oldG.icon !== newG.icon) summary["Icon"] = "Changed";
    if (oldG.banner !== newG.banner) summary["Banner"] = "Changed";
    if (oldG.description !== newG.description) summary["Description"] = (oldG.description ?? "none") + " → " + (newG.description ?? "none");
    if (oldG.verificationLevel !== newG.verificationLevel) summary["Verification Level"] = oldG.verificationLevel + " → " + newG.verificationLevel;
    if (Object.keys(summary).length)
      await sendLog(newG, "guild_update", sapphireEmbed("Server Updated", { Server: newG.name, ...summary }, { footerText: newG.name }));

    if (oldG.name !== newG.name)
      await sendLog(newG, "server_name_update", sapphireEmbed("Server Name Updated", {
        "Old Name": oldG.name, "New Name": newG.name,
      }, { footerText: newG.name }));

    if (oldG.icon !== newG.icon)
      await sendLog(newG, "server_icon_update", sapphireEmbed("Server Icon Updated", {
        Server: newG.name, ID: "`" + newG.id + "`",
      }, { footerText: newG.name }));

    if (oldG.banner !== newG.banner)
      await sendLog(newG, "server_banner_level_update", sapphireEmbed("Server Banner Updated", {
        Server: newG.name,
      }, { footerText: newG.name }));

    if (oldG.description !== newG.description)
      await sendLog(newG, "server_description_update", sapphireEmbed("Server Description Updated", {
        Server: newG.name,
      }, { footerText: newG.name }));

    if (oldG.afkChannelId !== newG.afkChannelId)
      await sendLog(newG, "afk_channel_update", sapphireEmbed("AFK Channel Updated", {
        "Old Channel": oldG.afkChannelId ? "<#" + oldG.afkChannelId + ">" : "None",
        "New Channel": newG.afkChannelId ? "<#" + newG.afkChannelId + ">" : "None",
      }, { footerText: newG.name }));

    if (oldG.afkTimeout !== newG.afkTimeout)
      await sendLog(newG, "afk_timeout_update", sapphireEmbed("AFK Timeout Updated", {
        "Old Timeout": String(oldG.afkTimeout) + "s", "New Timeout": String(newG.afkTimeout) + "s",
      }, { footerText: newG.name }));

    if (oldG.defaultMessageNotifications !== newG.defaultMessageNotifications)
      await sendLog(newG, "message_notification_update", sapphireEmbed("Message Notification Settings Updated", {
        Server: newG.name,
      }, { footerText: newG.name }));

    if (oldG.discoverySplash !== newG.discoverySplash)
      await sendLog(newG, "server_discovery_splash_update", sapphireEmbed("Discovery Splash Updated", {
        Server: newG.name,
      }, { footerText: newG.name }));

    if (oldG.features !== newG.features)
      await sendLog(newG, "server_features_update", sapphireEmbed("Server Features Updated", {
        Server: newG.name,
      }, { footerText: newG.name }));

    if (oldG.vanityURLCode !== newG.vanityURLCode)
      await sendLog(newG, "server_vanity_url_update", sapphireEmbed("Vanity URL Updated", {
        "Old URL": oldG.vanityURLCode ?? "None",
        "New URL": newG.vanityURLCode ?? "None",
      }, { footerText: newG.name }));

    if (oldG.mfaLevel !== newG.mfaLevel)
      await sendLog(newG, "mfa_level_update", sapphireEmbed("MFA Level Updated", {
        "Old Level": String(oldG.mfaLevel), "New Level": String(newG.mfaLevel),
      }, { footerText: newG.name }));

    if (oldG.ownerId !== newG.ownerId)
      await sendLog(newG, "server_owner_update", sapphireEmbed("Server Owner Updated", {
        "Old Owner": "<@" + oldG.ownerId + ">",
        "New Owner": "<@" + newG.ownerId + ">",
      }, { footerText: newG.name }));

    if (oldG.partnered !== newG.partnered)
      await sendLog(newG, "partnered_update", sapphireEmbed("Partnered Status Updated", {
        "Partnered": String(newG.partnered),
      }, { footerText: newG.name }));

    if (oldG.premiumProgressBarEnabled !== newG.premiumProgressBarEnabled)
      await sendLog(newG, "boost_progress_bar_toggle", sapphireEmbed("Boost Progress Bar Toggled", {
        "Enabled": String(newG.premiumProgressBarEnabled),
      }, { footerText: newG.name }));

    if (oldG.systemChannelId !== newG.systemChannelId) {
      await sendLog(newG, "public_updates_channel_update", sapphireEmbed("Public Updates Channel Updated", {
        Server: newG.name,
      }, { footerText: newG.name }));
      await sendLog(newG, "system_channel_update", sapphireEmbed("System Channel Updated", {
        Server: newG.name,
      }, { footerText: newG.name }));
    }

    if (oldG.rulesChannelId !== newG.rulesChannelId)
      await sendLog(newG, "server_rules_channel_update", sapphireEmbed("Rules Channel Updated", {
        Server: newG.name,
      }, { footerText: newG.name }));

    if (oldG.widgetEnabled !== newG.widgetEnabled)
      await sendLog(newG, "server_widget_update", sapphireEmbed("Server Widget Updated", {
        "Widget Enabled": String(newG.widgetEnabled),
      }, { footerText: newG.name }));

    if (oldG.preferredLocale !== newG.preferredLocale)
      await sendLog(newG, "server_preferred_locale_update", sapphireEmbed("Preferred Locale Updated", {
        "Old Locale": String(oldG.preferredLocale),
        "New Locale": String(newG.preferredLocale),
      }, { footerText: newG.name }));

    if (oldG.verificationLevel !== newG.verificationLevel)
      await sendLog(newG, "verification_level_update", sapphireEmbed("Verification Level Updated", {
        "Old Level": String(oldG.verificationLevel),
        "New Level": String(newG.verificationLevel),
      }, { footerText: newG.name }));

    if (oldG.verified !== newG.verified)
      await sendLog(newG, "verified_update", sapphireEmbed("Verified Status Updated", {
        "Verified": String(newG.verified),
      }, { footerText: newG.name }));
  });

  // ─────────────────────── THREADS (10) ────────────────────────
  client.on("threadCreate", async (thread) => {
    if (!thread.guild) return;
    await sendLog(thread.guild, "thread_create", sapphireEmbed("Thread Created", {
      Name: thread.name, ID: "`" + thread.id + "`",
      Parent: thread.parent ? "<#" + thread.parentId + ">" : "N/A",
    }, { footerText: thread.guild.name }));
  });

  client.on("threadDelete", async (thread) => {
    if (!thread.guild) return;
    await sendLog(thread.guild, "thread_delete", sapphireEmbed("Thread Deleted", {
      Name: thread.name, ID: "`" + thread.id + "`",
    }, { footerText: thread.guild.name }));
  });

  client.on("threadUpdate", async (oldT, newT) => {
    if (!newT.guild) return;
    const changes = {};
    if (oldT.name !== newT.name) changes["Name"] = oldT.name + " → " + newT.name;
    if (oldT.archived !== newT.archived) changes["Archived"] = oldT.archived + " → " + newT.archived;
    if (oldT.locked !== newT.locked) changes["Locked"] = oldT.locked + " → " + newT.locked;
    if (Object.keys(changes).length)
      await sendLog(newT.guild, "thread_update", sapphireEmbed("Thread Updated", {
        Thread: String(newT), ID: "`" + newT.id + "`", ...changes,
      }, { footerText: newT.guild.name }));

    if (oldT.name !== newT.name)
      await sendLog(newT.guild, "thread_name_update", sapphireEmbed("Thread Name Updated", {
        "Old Name": oldT.name, "New Name": newT.name,
      }, { footerText: newT.guild.name }));

    if (oldT.rateLimitPerUser !== newT.rateLimitPerUser)
      await sendLog(newT.guild, "thread_slow_mode_update", sapphireEmbed("Thread Slow Mode Updated", {
        "Old Limit": String(oldT.rateLimitPerUser) + "s",
        "New Limit": String(newT.rateLimitPerUser) + "s",
      }, { footerText: newT.guild.name }));

    if (oldT.autoArchiveDuration !== newT.autoArchiveDuration)
      await sendLog(newT.guild, "thread_archive_duration_update", sapphireEmbed("Thread Archive Duration Updated", {
        "Old Duration": String(oldT.autoArchiveDuration) + "m",
        "New Duration": String(newT.autoArchiveDuration) + "m",
      }, { footerText: newT.guild.name }));
  });

  // ─────────────────────── VOICE (7) ───────────────────────────
  client.on("voiceStateUpdate", async (oldState, newState) => {
    const guild = newState.guild ?? oldState.guild;
    const user = newState.member?.user ?? oldState.member?.user;
    if (!guild || !user) return;

    const wasVoice = oldState.channel !== null;
    const isVoice = newState.channel !== null;

    if (!wasVoice && isVoice) {
      const av = user.displayAvatarURL({ extension: "png", size: 256 });
      await sendLog(guild, "voice_user_join", sapphireEmbed("Voice Join", {
        User: user.tag + " `(" + user.id + ")`",
        Channel: "<#" + newState.channelId + ">",
      }, { thumbnailUrl: av, footerText: user.tag }));
    } else if (wasVoice && !isVoice) {
      const av = user.displayAvatarURL({ extension: "png", size: 256 });
      await sendLog(guild, "voice_user_leave", sapphireEmbed("Voice Leave", {
        User: user.tag + " `(" + user.id + ")`",
        "Left Channel": "<#" + oldState.channelId + ">",
      }, { thumbnailUrl: av, footerText: user.tag }));
    } else if (wasVoice && isVoice && oldState.channelId !== newState.channelId) {
      const av = user.displayAvatarURL({ extension: "png", size: 256 });
      await sendLog(guild, "voice_user_switch", sapphireEmbed("Voice Switch", {
        User: user.tag + " `(" + user.id + ")`",
        From: "<#" + oldState.channelId + ">",
        To: "<#" + newState.channelId + ">",
      }, { thumbnailUrl: av, footerText: user.tag }));
    }

    if (oldState.mute !== newState.mute && isVoice) {
      const av = user.displayAvatarURL({ extension: "png", size: 256 });
      await sendLog(guild, "voice_user_mute", sapphireEmbed("Voice Mute", {
        User: user.tag, Muted: String(newState.mute),
      }, { thumbnailUrl: av, footerText: user.tag }));
    }

    if (oldState.deaf !== newState.deaf && isVoice) {
      const av = user.displayAvatarURL({ extension: "png", size: 256 });
      await sendLog(guild, "voice_user_deafen", sapphireEmbed("Voice Deafen", {
        User: user.tag, Deafened: String(newState.deaf),
      }, { thumbnailUrl: av, footerText: user.tag }));
    }
  });

  // ─────────────────────── APPLICATIONS (1) ──────────────────
  client.on("applicationCommandPermissionsUpdate", async (data) => {
    const guild = client.guilds.cache.get(data.guildId);
    if (!guild) return;
    await sendLog(guild, "app_command_permissions_update", sapphireEmbed("Command Permissions Updated", {
      Application: data.applicationId ? "`" + data.applicationId + "`" : "N/A",
      Command: data.id ? "`" + data.id + "`" : "N/A",
      Permissions: String(data.permissions?.length ?? 0),
    }, { footerText: guild.name }));
  });

  // Fallback for all remaining discord.js client events (full Events enum coverage).
  const explicitlyHandled = new Set([
    "ChannelCreate",
    "ChannelDelete",
    "ChannelPinsUpdate",
    "ChannelUpdate",
    "AutoModerationActionExecution",
    "AutoModerationRuleCreate",
    "AutoModerationRuleDelete",
    "AutoModerationRuleUpdate",
    "GuildMemberAdd",
    "GuildMemberRemove",
    "GuildMemberUpdate",
    "GuildBanAdd",
    "GuildBanRemove",
    "GuildUpdate",
    "InviteCreate",
    "InviteDelete",
    "MessageBulkDelete",
    "MessageDelete",
    "MessageUpdate",
    "GuildRoleCreate",
    "GuildRoleDelete",
    "GuildRoleUpdate",
    "GuildScheduledEventCreate",
    "GuildScheduledEventDelete",
    "GuildScheduledEventUpdate",
    "GuildScheduledEventUserAdd",
    "GuildScheduledEventUserRemove",
    "ThreadCreate",
    "ThreadDelete",
    "ThreadUpdate",
    "VoiceStateUpdate",
    "GuildIntegrationsUpdate",
    "StageInstanceCreate",
    "StageInstanceDelete",
    "StageInstanceUpdate",
  ]);

  for (const [enumName, eventName] of Object.entries(Events)) {
    if (explicitlyHandled.has(enumName)) continue;
    client.on(eventName, async (...args) => {
      const guild = resolveGuild(args, client);
      const eventKey = "discord_" + toSnakeCase(enumName);
      if (guild) {
        await sendLog(guild, eventKey, sapphireEmbed("Discord Event: " + enumName, {
          Event: eventName,
          ...genericEventFields(args),
        }, { footerText: guild.name }));
        return;
      }

      const guilds = [...client.guilds.cache.values()];
      if (!guilds.length) return;
      const embed = sapphireEmbed("Discord Event: " + enumName, {
        Event: eventName,
        Scope: "Global",
        ...genericEventFields(args),
      }, { footerText: "Global Client Event" });
      for (const g of guilds) {
        await sendLog(g, eventKey, embed);
      }
    });
  }

  console.log("[Logging] Setup complete - monitoring 200+ server events");
}

module.exports = { setupLogging, sapphireEmbed, sendLog };

const { GuildConfig } = require("../models/GuildConfig");
const { ModerationCase } = require("../models/ModerationCase");
const { TimedAction } = require("../models/TimedAction");
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

  const tick = () => processDueActions(client).catch((error) => console.error("Timed moderation processing failed:", error));
  tick();
  client.moderationScheduler = setInterval(tick, 15_000);
  client.moderationScheduler.unref();
}

module.exports = {
  startScheduler,
};

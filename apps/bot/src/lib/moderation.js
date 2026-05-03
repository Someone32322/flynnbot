const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { randomInt } = require("node:crypto");

const { GuildConfig } = require("../models/GuildConfig");
const { ModerationCase } = require("../models/ModerationCase");
const { ModerationConfig } = require("../models/ModerationConfig");
const { PersistentRole } = require("../models/PersistentRole");
const { TimedAction } = require("../models/TimedAction");
const { formatDate, formatDuration, parseDuration } = require("./time");
const MOD_MESSAGES = require("./mod-messages");

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
const ACTIVE_CASE_TYPES = new Set(["ban", "mute", "deafen", "vcmute", "temprole", "lock", "lockdown"]);
const CASE_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const CASE_ID_LENGTH = 8;
const SAPPHIRE_COLOR = 0x0f52ba;

function buildSapphireEmbed({
  title,
  description,
  fields = [],
  footerText,
  footerIconUrl,
  thumbnailUrl,
  color = SAPPHIRE_COLOR,
  timestamp = false,
} = {}) {
  const embed = new EmbedBuilder().setColor(color);

  if (title) {
    embed.setTitle(title);
  }

  if (description) {
    embed.setDescription(description);
  }

  if (fields.length > 0) {
    embed.addFields(fields);
  }

  if (thumbnailUrl) {
    embed.setThumbnail(thumbnailUrl);
  }

  if (footerText) {
    embed.setFooter({ text: footerText, iconURL: footerIconUrl });
  }

  if (timestamp) {
    embed.setTimestamp();
  }

  return embed;
}

function ephemeral(content) {
  const description = typeof content === "string" ? content : content?.description;
  const title = typeof content === "object" && content?.title ? content.title : undefined;
  const color = typeof content === "object" && content?.color ? content.color : SAPPHIRE_COLOR;
  const fields = typeof content === "object" && Array.isArray(content?.fields) ? content.fields : [];
  const footerText = typeof content === "object" ? content?.footerText : undefined;
  const footerIconUrl = typeof content === "object" ? content?.footerIconUrl : undefined;
  const thumbnailUrl = typeof content === "object" ? content?.thumbnailUrl : undefined;
  const timestamp = typeof content === "object" ? Boolean(content?.timestamp) : false;
  const embed = buildSapphireEmbed({
    title,
    description,
    fields,
    footerText,
    footerIconUrl,
    thumbnailUrl,
    color,
    timestamp,
  });

  return {
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  };
}

function normalizeReason(reason) {
  return reason?.trim() || "No reason provided.";
}

async function getGuildConfig(guildId) {
  return GuildConfig.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
}

/**
 * Fetch the ModerationConfig for a guild (dashboard settings).
 * Returns null if no config exists yet.
 */
async function getModerationConfig(guildId) {
  return ModerationConfig.findOne({ guildId }).lean().catch(() => null);
}

/**
 * Check if a target member is immune to a given moderation action.
 * Returns true if the action can proceed, false if the target is immune.
 * When false, an ephemeral reply is already sent to the interaction.
 */
async function checkImmuneRoles(interaction, targetMember, actionType, modConfig) {
  if (!targetMember || !modConfig?.immuneRoles) return true;

  const ir = modConfig.immuneRoles;

  // Role-hierarchy check
  if (ir.useHierarchy && targetMember && interaction.member) {
    const botMember = interaction.guild.members.me;
    const targetHighest = targetMember.roles.highest.position;
    const modHighest    = interaction.member.roles.highest.position;
    const botHighest    = botMember?.roles.highest.position ?? 0;
    // If target's highest role is >= moderator's highest, block it
    if (interaction.guild.ownerId !== interaction.user.id && targetHighest >= modHighest) {
      await interaction.editReply(
        ephemeral("You cannot moderate that user — they have an equal or higher role than you (hierarchy protection is on).")
      );
      return false;
    }
    if (targetHighest >= botHighest) {
      await interaction.editReply(
        ephemeral("The bot cannot moderate that user — they have an equal or higher role than the bot.")
      );
      return false;
    }
  }

  // Explicit immune role check
  const immuneRoleIds = [
    ...(ir.global   || []),
    ...(ir[actionType] || []),
  ];

  if (immuneRoleIds.length === 0) return true;

  const memberRoleIds = [...targetMember.roles.cache.keys()];
  const isImmune      = immuneRoleIds.some((id) => memberRoleIds.includes(id));

  if (isImmune) {
    await interaction.editReply(
      ephemeral("That user has a role that is immune to this moderation action.")
    );
    return false;
  }

  return true;
}

/**
 * Return whether a DM notification should be sent to a punished user.
 * @param {object|null} modConfig  - ModerationConfig lean document
 * @param {'onPunish'|'onUnpunish'} eventType
 */
function shouldSendDm(modConfig, eventType = "onPunish") {
  if (!modConfig) return true;
  const un = modConfig.userNotifications;
  if (!un) return true;
  if (un.enabled === false) return false;
  return un[eventType] !== false;
}

function hasAdminAccess(interaction) {
  return (
    interaction.guild.ownerId === interaction.user.id ||
    interaction.memberPermissions.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)
  );
}

async function requireAdminAccess(interaction) {
  if (hasAdminAccess(interaction)) {
    return true;
  }

  await interaction.reply(ephemeral("Only the server owner or an admin can use this command."));
  return null;
}

async function requireModeratorAccess(interaction) {
  const guildConfig = await getGuildConfig(interaction.guildId);
  if (hasAdminAccess(interaction)) {
    return guildConfig;
  }

  const moderatorRoleId = guildConfig.moderation?.moderatorRoleId;
  if (!moderatorRoleId) {
    await interaction.reply(ephemeral("No moderator role is configured yet. Use /setmodrole first."));
    return null;
  }

  if (!interaction.member.roles.cache.has(moderatorRoleId)) {
    await interaction.reply(ephemeral("You do not have the configured moderator role."));
    return null;
  }

  return guildConfig;
}

function parseUserId(input) {
  if (!input) {
    return null;
  }

  return `${input}`.replace(/[<@!>]/g, "").trim() || null;
}

async function resolveUserFromInput(client, input) {
  const userId = parseUserId(input);
  if (!userId) {
    return null;
  }

  try {
    return await client.users.fetch(userId);
  } catch {
    return null;
  }
}

async function getTargetMember(guild, userId) {
  try {
    return await guild.members.fetch(userId);
  } catch {
    return null;
  }
}

function canModerateTarget(interaction, targetMember) {
  if (!targetMember) {
    return true;
  }

  if (interaction.user.id === targetMember.id) {
    return false;
  }

  if (interaction.guild.ownerId === targetMember.id) {
    return false;
  }

  if (interaction.user.id === interaction.guild.ownerId) {
    return true;
  }

  return interaction.member.roles.highest.comparePositionTo(targetMember.roles.highest) > 0;
}

async function ensureTargetModeratable(interaction, targetMember) {
  if (!canModerateTarget(interaction, targetMember)) {
    await interaction.reply(
      ephemeral("You cannot moderate that user because of ownership, self-targeting, or role hierarchy.")
    );
    return false;
  }

  if (targetMember && !targetMember.moderatable && !targetMember.bannable && !targetMember.kickable) {
    await interaction.reply(ephemeral("The bot cannot moderate that user with the current role hierarchy."));
    return false;
  }

  return true;
}

async function sendDmNotice(user, message) {
  try {
    const payload =
      typeof message === "string"
        ? {
            embeds: [
              new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle("Moderation Notice")
                .setDescription(message)
                .setFooter({ text: "Flynn Moderation" })
                .setTimestamp(),
            ],
          }
        : message;

    await user.send(payload);
    return { delivered: true, suffix: "message sent" };
  } catch {
    return { delivered: false, suffix: "message not sent due to user restrictions" };
  }
}

function generateCaseIdCandidate() {
  let value = "";
  for (let i = 0; i < CASE_ID_LENGTH; i += 1) {
    value += CASE_ID_CHARS[randomInt(CASE_ID_CHARS.length)];
  }
  return value;
}

async function getNextCaseNumber() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateCaseIdCandidate();
    // Enforce globally unique IDs across all guilds.
    const existing = await ModerationCase.exists({ caseNumber: candidate });
    if (!existing) {
      return candidate;
    }
  }

  throw new Error("Could not generate a unique case ID after multiple attempts.");
}

async function createModerationCase({
  guild,
  moderator,
  targetUser,
  type,
  reason,
  active = false,
  durationMs = null,
  metadata = {},
  dmDelivered = false,
}) {
  const caseNumber = await getNextCaseNumber();
  const expiresAt = durationMs ? new Date(Date.now() + durationMs) : null;

  return ModerationCase.create({
    guildId: guild.id,
    caseNumber,
    type,
    targetUserId: targetUser.id,
    targetTag: targetUser.tag ?? `${targetUser.username}`,
    moderatorId: moderator.id,
    moderatorTag: moderator.tag ?? `${moderator.username}`,
    reason: normalizeReason(reason),
    active: active || ACTIVE_CASE_TYPES.has(type),
    durationMs,
    expiresAt,
    dmDelivered,
    metadata,
  });
}

async function scheduleTimedAction({
  guildId,
  caseDocument,
  actionType,
  executeAt,
  targetUserId = null,
  roleId = null,
  channelId = null,
  channelIds = [],
  metadata = {},
}) {
  return TimedAction.findOneAndUpdate(
    { caseId: caseDocument._id, actionType, active: true },
    {
      $set: {
        guildId,
        caseNumber: caseDocument.caseNumber,
        targetUserId,
        roleId,
        channelId,
        channelIds,
        executeAt,
        metadata,
        active: true,
      },
      $setOnInsert: {
        caseId: caseDocument._id,
        actionType,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function cancelTimedActions(caseId) {
  await TimedAction.updateMany({ caseId, active: true }, { $set: { active: false } });
}

async function closeCase(caseDocument, removedReason = null) {
  caseDocument.active = false;
  caseDocument.endedAt = new Date();
  if (removedReason) {
    caseDocument.removedAt = new Date();
    caseDocument.removedReason = removedReason;
  }
  await caseDocument.save();
  await cancelTimedActions(caseDocument._id);
  return caseDocument;
}

async function logToAuditChannel(guild, guildConfig, title, fields = [], color = 0xffaa00, options = {}) {
  const channelId = guildConfig.moderation?.auditLogChannelId;
  if (!channelId) {
    return;
  }

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    return;
  }

  const embed = buildSapphireEmbed({
    title,
    description: options.description,
    fields,
    thumbnailUrl: options.thumbnailUrl,
    footerText: options.footerText || `Guild ID: ${guild.id}`,
    footerIconUrl: options.footerIconUrl,
    color,
    timestamp: true,
  }).setAuthor({ name: `${guild.name} Audit Log`, iconURL: guild.iconURL() || undefined });

  await channel.send({ embeds: [embed] }).catch(() => null);
}

async function logCaseToAudit(guild, guildConfig, caseDocument, extraFields = [], color = 0xffaa00) {
  const actionLabel = `${caseDocument.type}`.charAt(0).toUpperCase() + `${caseDocument.type}`.slice(1);
  const duration = caseDocument.durationMs ? formatDuration(caseDocument.durationMs) : "Permanent";
  const extraLines = extraFields.map((field) => `> **${field.name}:** ${field.value}`);
  const description = [
    `> **User:** ${caseDocument.targetTag || caseDocument.targetUserId} (<@${caseDocument.targetUserId}>)`,
    `> **Reason:** ${caseDocument.reason || "No reason provided."}`,
    `> **Duration:** ${duration}`,
    ...extraLines,
  ].join("\n");

  const targetUser = await guild.client.users.fetch(caseDocument.targetUserId).catch(() => null);
  const moderatorUser = await guild.client.users.fetch(caseDocument.moderatorId).catch(() => null);
  const thumbnailUrl = targetUser?.displayAvatarURL({ extension: "png", size: 256 });
  const footerIconUrl = moderatorUser?.displayAvatarURL({ extension: "png", size: 128 });
  const footerText = moderatorUser
    ? `${moderatorUser.tag}`
    : caseDocument.moderatorTag || caseDocument.moderatorId;

  await logToAuditChannel(
    guild,
    guildConfig,
    `${actionLabel} \`${caseDocument.caseNumber}\``,
    [],
    color,
    { description, thumbnailUrl, footerText, footerIconUrl }
  );
}

function getStaffPunishmentLabel(actionType) {
  const labels = {
    ban: "has been banned",
    kick: "has been kicked",
    warn: "has been warned",
    mute: "has been muted",
    unmute: "has been unmuted",
    softban: "has been softbanned",
    unban: "has been unbanned",
    deafen: "has been deafened",
    undeafen: "has been undeafened",
    vcmute: "has been voice muted",
    unvcmute: "has been voice unmuted",
    note: "has been noted",
    clearnotes: "notes have been cleared",
    editnote: "note has been edited",
    delwarn: "warning has been removed",
    unwarn: "warning has been removed",
    reason: "reason has been updated",
    duration: "duration has been updated",
    retime: "duration has been retimed",
    lock: "has been locked",
    unlock: "has been unlocked",
    lockdown: "has been locked down",
    temprole: "temporary role has been assigned",
    removetemprole: "temporary role has been removed",
    rolepersist: "persistent role has been updated",
  };

  return labels[actionType] || actionType;
}

function buildCaseSummary(caseDocument) {
  const lines = [
    `Case \`${caseDocument.caseNumber}\``,
    `Type: ${caseDocument.type}`,
    `Target: <@${caseDocument.targetUserId}>`,
    `Moderator: <@${caseDocument.moderatorId}>`,
    `Reason: ${caseDocument.reason || "No reason provided."}`,
    `Duration: ${caseDocument.durationMs ? formatDuration(caseDocument.durationMs) : "Permanent"}`,
    `Expires: ${caseDocument.expiresAt ? formatDate(caseDocument.expiresAt) : "Not scheduled"}`,
    `Active: ${caseDocument.active ? "Yes" : "No"}`,
  ];

  if (caseDocument.metadata?.roleId) {
    lines.push(`Role: <@&${caseDocument.metadata.roleId}>`);
  }

  if (caseDocument.metadata?.channelId) {
    lines.push(`Channel: <#${caseDocument.metadata.channelId}>`);
  }

  if (caseDocument.metadata?.note) {
    lines.push(`Note: ${caseDocument.metadata.note}`);
  }

  return lines.join("\n");
}

async function findCase(guildId, caseNumber) {
  return ModerationCase.findOne({ guildId, caseNumber });
}

async function listCasesForUser(guildId, targetUserId, types = null) {
  const query = { guildId, targetUserId };
  if (types?.length) {
    query.type = { $in: types };
  }

  return ModerationCase.find(query).sort({ createdAt: -1 }).lean();
}

async function listActiveCases(guildId, targetUserId) {
  return ModerationCase.find({ guildId, targetUserId, active: true }).sort({ createdAt: -1 }).lean();
}

async function updateCaseReason(caseDocument, reason) {
  caseDocument.reason = normalizeReason(reason);
  await caseDocument.save();
  return caseDocument;
}

async function updateCaseDuration(caseDocument, durationMs) {
  caseDocument.durationMs = durationMs;
  caseDocument.expiresAt = durationMs ? new Date(Date.now() + durationMs) : null;
  await caseDocument.save();

  if (caseDocument.expiresAt) {
    await TimedAction.updateMany(
      { caseId: caseDocument._id, active: true },
      { $set: { executeAt: caseDocument.expiresAt } }
    );
  }

  return caseDocument;
}

async function addPersistentRole({ guildId, userId, roleId, assignedById, reason }) {
  await PersistentRole.findOneAndUpdate(
    { guildId, userId, roleId },
    { $set: { assignedById, reason: normalizeReason(reason) } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function removePersistentRole(guildId, userId, roleId) {
  return PersistentRole.findOneAndDelete({ guildId, userId, roleId });
}

async function togglePersistentRole({ guildId, userId, roleId, assignedById, reason }) {
  const existing = await PersistentRole.findOne({ guildId, userId, roleId });
  if (existing) {
    await existing.deleteOne();
    return false;
  }

  await addPersistentRole({ guildId, userId, roleId, assignedById, reason });
  return true;
}

async function getPersistentRoles(guildId, userId) {
  return PersistentRole.find({ guildId, userId }).lean();
}

function getModerationTargetInput(interaction, userOption = "user", idOption = "user_id") {
  const user = interaction.options.getUser(userOption);
  const rawId = interaction.options.getString(idOption);
  return {
    user,
    rawId,
  };
}

async function resolveModerationTarget(interaction, userOption = "user", idOption = "user_id") {
  const targetInput = getModerationTargetInput(interaction, userOption, idOption);
  const targetUser = targetInput.user || (await resolveUserFromInput(interaction.client, targetInput.rawId));
  if (!targetUser) {
    return null;
  }

  const targetMember = await getTargetMember(interaction.guild, targetUser.id);
  return { targetUser, targetMember };
}

function buildDmReason(prefix, guildName, moderatorTag, reason, durationMs = null) {
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(prefix)
    .setDescription(`A moderation action was taken in **${guildName}**.`)
    .addFields(
      { name: "Moderator", value: moderatorTag, inline: true },
      { name: "Reason", value: normalizeReason(reason), inline: false }
    )
    .setFooter({ text: "Flynn Moderation" })
    .setTimestamp();

  if (durationMs) {
    embed.addFields({ name: "Duration", value: formatDuration(durationMs), inline: true });
  }

  return { embeds: [embed] };
}

function buildActionDm(actionType, guildName, moderatorTag, reason, durationMs = null) {
  const config = MOD_MESSAGES[actionType]?.dm;
  const description = config?.description
    ? config.description(guildName, reason)
    : `A moderation action was taken in **${guildName}**.`;
  const color = config?.color ?? 0xed4245;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(description)
    .setFooter({ text: "Flynn Moderation" })
    .setTimestamp();

  const label = `Message from server: ${guildName}`.slice(0, 80);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("server_origin")
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  return { embeds: [embed], components: [row] };
}

function getAuditColor(actionType, fallback = 0xffaa00) {
  return SAPPHIRE_COLOR;
}

function buildStaffReply(actionType, ctx) {
  const caseDocument = ctx?.caseDocument;
  const targetId = ctx?.targetUser?.id || caseDocument?.targetUserId || ctx?.userId;
  const targetMention = targetId ? `<@${targetId}>` : "User";
  const punishment = getStaffPunishmentLabel(actionType);
  const reason = ctx?.reason || caseDocument?.reason || "No reason provided.";
  const duration =
    ctx?.duration ||
    (caseDocument?.durationMs ? formatDuration(caseDocument.durationMs) : caseDocument ? "Permanent" : "N/A");

  const embed = buildSapphireEmbed({
    color: SAPPHIRE_COLOR,
    description:
    `✅ ${targetMention} ${punishment}\n> **Reason:** ${reason}\n> **Duration:** ${duration}`
  });

  return {
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  };
}

function parseDurationOption(interaction, optionName = "time") {
  const input = interaction.options.getString(optionName);
  if (!input) {
    return null;
  }

  return parseDuration(input);
}

async function ensureTimeoutWithinLimits(interaction, durationMs) {
  if (durationMs && durationMs > MAX_TIMEOUT_MS) {
    await interaction.reply(
      ephemeral("Discord native timeouts max out at 28 days. Use a duration of 28d or less for mute/unmute retiming.")
    );
    return false;
  }

  return true;
}

function getLockableChannels(guild) {
  return guild.channels.cache.filter(
    (channel) =>
      [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type) &&
      channel.manageable
  );
}

module.exports = {
  MAX_TIMEOUT_MS,
  ACTIVE_CASE_TYPES,
  SAPPHIRE_COLOR,
  addPersistentRole,
  buildActionDm,
  buildCaseSummary,
  buildDmReason,
  buildSapphireEmbed,
  buildStaffReply,
  cancelTimedActions,
  checkImmuneRoles,
  closeCase,
  ensureTargetModeratable,
  ensureTimeoutWithinLimits,
  ephemeral,
  findCase,
  formatDuration,
  getAuditColor,
  getGuildConfig,
  getModerationConfig,
  getTargetMember,
  getLockableChannels,
  getPersistentRoles,
  hasAdminAccess,
  listActiveCases,
  listCasesForUser,
  logCaseToAudit,
  logToAuditChannel,
  normalizeReason,
  parseDurationOption,
  parseUserId,
  removePersistentRole,
  requireAdminAccess,
  requireModeratorAccess,
  resolveModerationTarget,
  resolveUserFromInput,
  scheduleTimedAction,
  sendDmNotice,
  shouldSendDm,
  togglePersistentRole,
  updateCaseDuration,
  updateCaseReason,
  createModerationCase,
};

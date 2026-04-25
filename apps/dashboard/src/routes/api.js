const express = require('express');
const path = require('path');
const router = express.Router();

const { GuildConfig } = require('../models/GuildConfig');
const { LoggingConfig } = require('../models/LoggingConfig');
const { EmbedTemplate } = require('../models/EmbedTemplate');
const { ReactionRole } = require('../models/ReactionRole');
const { ScheduledMessage } = require('../models/ScheduledMessage');
const discordApi = require('../lib/discord');

// Dashboard-local command manifest so this app can run outside the monorepo.
const COMMAND_MANIFEST = require(path.join(__dirname, '../commands/manifest.json'));
const COMMAND_META = COMMAND_MANIFEST.meta || {};
const COMMAND_DATA = COMMAND_MANIFEST.commandData || {};

// ── Auth guard ────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

function hasAdmin(permissions) {
  try { return (BigInt(permissions) & 0x8n) !== 0n; } catch { return false; }
}

function requireGuildAdmin(req, res, next) {
  const { guildId } = req.params;
  if (!/^\d+$/.test(guildId)) return res.status(400).json({ error: 'Invalid guild ID' });
  const guild = req.user.guilds?.find((g) => g.id === guildId && hasAdmin(g.permissions));
  if (!guild) return res.status(403).json({ error: 'Missing administrator permission' });
  req.userGuild = guild;
  next();
}

// ── GET /api/guild/:guildId/commands ─────────────────────────
// Returns every command in the manifest merged with the guild's saved settings.
router.get('/guild/:guildId/commands', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const config = await GuildConfig.findOne({ guildId });

    const result = Object.entries(COMMAND_META)
      .filter(([, meta]) => !meta.globalOnly)
      .map(([name, meta]) => {
        const saved = config?.commandSettings?.get(name);
        return {
          name,
          category: meta.category,
          description: meta.description,
          usage: meta.usage,
          aliases: meta.aliases ?? [],
          settings: {
            enabled: saved?.enabled ?? false,
            ephemeralMode: saved?.ephemeralMode ?? 'default',
            customDescription: saved?.customDescription ?? '',
            allowedRoles: saved?.allowedRoles ?? [],
            allowedChannels: saved?.allowedChannels ?? [],
            prefixEnabled: saved?.prefixEnabled ?? true,
            discordCommandId: saved?.discordCommandId ?? null,
          },
        };
      });

    res.json(result);
  } catch (err) {
    console.error('[API] GET commands', err);
    res.status(500).json({ error: 'Failed to fetch commands' });
  }
});

// ── GET /api/guild/:guildId/config ────────────────────────────
router.get('/guild/:guildId/config', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const config = await GuildConfig.findOne({ guildId });
    res.json({
      prefixEnabled: config?.prefixEnabled ?? false,
      prefixes: config?.prefixes ?? [],
    });
  } catch (err) {
    console.error('[API] GET config', err);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

// ── PATCH /api/guild/:guildId/config ─────────────────────────
router.patch('/guild/:guildId/config', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { prefixEnabled, prefixes } = req.body;

    const update = {};
    if (typeof prefixEnabled === 'boolean') update.prefixEnabled = prefixEnabled;
    if (Array.isArray(prefixes)) {
      // Sanitise: max 5, non-empty strings, max 10 chars each
      update.prefixes = prefixes
        .filter((p) => typeof p === 'string' && p.trim().length > 0 && p.trim().length <= 10)
        .slice(0, 5)
        .map((p) => p.trim());
    }

    await GuildConfig.findOneAndUpdate(
      { guildId },
      { $set: update },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[API] PATCH config', err);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// ── POST /api/guild/:guildId/commands/:name/enable ───────────
// Registers the command in the guild via Discord API and marks it enabled.
router.post('/guild/:guildId/commands/:name/enable', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, name } = req.params;
    const meta = COMMAND_META[name];
    if (!meta || meta.globalOnly) return res.status(404).json({ error: 'Command not found' });

    const commandData = COMMAND_DATA[name];
    if (!commandData) {
      return res.status(500).json({ error: `Command data missing for "${name}" in dashboard manifest` });
    }

    // Register in Discord guild
    const registered = await discordApi.registerGuildCommand(guildId, commandData);

    // Persist to DB
    await GuildConfig.findOneAndUpdate(
      { guildId },
      {
        $set: {
          [`commandSettings.${name}.enabled`]: true,
          [`commandSettings.${name}.discordCommandId`]: registered.id,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    res.json({ ok: true, commandId: registered.id });
  } catch (err) {
    console.error('[API] enable command', err);
    res.status(500).json({ error: err.message || 'Failed to enable command' });
  }
});

// ── POST /api/guild/:guildId/commands/:name/disable ──────────
// Removes the command from the guild in Discord and marks it disabled.
router.post('/guild/:guildId/commands/:name/disable', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, name } = req.params;

    const config = await GuildConfig.findOne({ guildId });
    const cmdSettings = config?.commandSettings?.get(name);
    const commandId = cmdSettings?.discordCommandId;

    if (commandId) {
      try {
        await discordApi.deleteGuildCommand(guildId, commandId);
      } catch (e) {
        // If already gone from Discord, continue
        if (!e.message?.includes('10063') && !e.message?.includes('Unknown')) throw e;
      }
    }

    await GuildConfig.findOneAndUpdate(
      { guildId },
      {
        $set: {
          [`commandSettings.${name}.enabled`]: false,
          [`commandSettings.${name}.discordCommandId`]: null,
        },
      },
      { upsert: true }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[API] disable command', err);
    res.status(500).json({ error: err.message || 'Failed to disable command' });
  }
});

// ── PATCH /api/guild/:guildId/commands/:name ─────────────────
// Update settings for a command (roles, channels, ephemeral, description, prefix).
router.patch('/guild/:guildId/commands/:name', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, name } = req.params;
    if (!COMMAND_META[name]) return res.status(404).json({ error: 'Command not found' });

    const allowed = ['ephemeralMode', 'customDescription', 'allowedRoles', 'allowedChannels', 'prefixEnabled'];
    const update = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        update[`commandSettings.${name}.${key}`] = req.body[key];
      }
    }

    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update' });

    // If customDescription is set, also patch description in Discord
    const config = await GuildConfig.findOneAndUpdate(
      { guildId },
      { $set: update },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    const cmdSettings = config.commandSettings?.get(name);
    if (cmdSettings?.discordCommandId && req.body.customDescription !== undefined) {
      try {
        const commandData = COMMAND_DATA[name];
        if (!commandData) throw new Error(`Command data missing for "${name}" in dashboard manifest`);
        const desc = req.body.customDescription?.trim() || commandData.description;
        await discordApi.updateGuildCommand(guildId, cmdSettings.discordCommandId, {
          ...commandData,
          description: desc,
        });
      } catch (_) {
        // Non-fatal — DB is already updated
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[API] PATCH command settings', err);
    res.status(500).json({ error: 'Failed to update command settings' });
  }
});

// ── GET /api/guild/:guildId/roles ─────────────────────────────
router.get('/guild/:guildId/roles', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const roles = await discordApi.getGuildRoles(req.params.guildId);
    // Filter out @everyone, sort by position
    const filtered = roles
      .filter((r) => r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, name: r.name, color: r.color }));
    res.json(filtered);
  } catch (err) {
    console.error('[API] GET roles', err);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// ── GET /api/guild/:guildId/channels ──────────────────────────
router.get('/guild/:guildId/channels', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const channels = await discordApi.getGuildChannels(req.params.guildId);
    const mapped = channels
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((c) => ({ id: c.id, name: c.name, type: c.type }));
    res.json(mapped);
  } catch (err) {
    console.error('[API] GET channels', err);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// ── GET /api/guild/:guildId/logging ──────────────────────────
router.get('/guild/:guildId/logging', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const cfg = await LoggingConfig.findOne({ guildId: req.params.guildId }).lean();
    res.json({ channels: cfg?.channels ?? {} });
  } catch (err) {
    console.error('[API] GET logging', err);
    res.status(500).json({ error: 'Failed to fetch logging config' });
  }
});

// ── PATCH /api/guild/:guildId/logging ────────────────────────
router.patch('/guild/:guildId/logging', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { channels } = req.body;
    if (typeof channels !== 'object' || Array.isArray(channels)) {
      return res.status(400).json({ error: 'channels must be an object' });
    }

    // Sanitise: values must be string channel IDs or null
    const clean = {};
    for (const [key, val] of Object.entries(channels)) {
      if (val === null || val === '') { clean[key] = null; }
      else if (typeof val === 'string' && /^\d+$/.test(val)) { clean[key] = val; }
    }

    await LoggingConfig.findOneAndUpdate(
      { guildId },
      { $set: { channels: clean } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] PATCH logging', err);
    res.status(500).json({ error: 'Failed to update logging config' });
  }
});

// ── POST /api/guild/:guildId/logging/test ────────────────────
// Send a test embed to the configured logging channel for a specific event type.
router.post('/guild/:guildId/logging/test', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { eventKey } = req.body;

    if (!eventKey || typeof eventKey !== 'string') {
      return res.status(400).json({ error: 'eventKey is required' });
    }

    const cfg = await LoggingConfig.findOne({ guildId }).lean();
    const channelId = cfg?.channels?.[eventKey];

    if (!channelId) {
      return res.status(400).json({ error: `No logging channel configured for ${eventKey}` });
    }

    // Build a test embed
    const testEmbed = {
      title: `🧪 Test: ${eventKey}`,
      description: `This is a test message for **${eventKey}** event type.`,
      color: 0x0f52ba,
      fields: [
        { name: 'Timestamp', value: new Date().toISOString(), inline: false },
        { name: 'Guild ID', value: guildId, inline: true },
        { name: 'Test Status', value: '✅ Successful', inline: true },
      ],
      footer: { text: 'FlynnBot Test Message' },
    };

    // Send to Discord
    const response = await discordApi.postMessage(channelId, { embeds: [testEmbed] }).catch((e) => {
      throw new Error(`Failed to send test to channel: ${e.message}`);
    });

    res.json({ ok: true, messageId: response.id, channelId });
  } catch (err) {
    console.error('[API] POST logging/test', err);
    res.status(500).json({ error: err.message || 'Failed to send test message' });
  }
});

// ╔══════════════════════════════════════════════════════════════╗
// ║  MESSAGE BUILDER — ScheduledMessage CRUD + delivery         ║
// ╚══════════════════════════════════════════════════════════════╝

// ── GET /api/guild/:guildId/messages ────────────────────────────
router.get('/guild/:guildId/messages', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const msgs = await ScheduledMessage.find({ guildId: req.params.guildId }).sort({ createdAt: -1 }).lean();
    res.json(msgs);
  } catch (err) {
    console.error('[API] GET messages', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ── POST /api/guild/:guildId/messages ───────────────────────────
router.post('/guild/:guildId/messages', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const data = sanitiseBuilderMsg(req.body);
    if (!data.name) return res.status(400).json({ error: 'name is required' });

    if (data.delivery.type === 'schedule_once' && data.delivery.scheduleAt) {
      data.delivery.nextRun = new Date(data.delivery.scheduleAt);
    } else if (data.delivery.type === 'schedule_repeat' && data.delivery.intervalMins) {
      data.delivery.nextRun = new Date(Date.now() + data.delivery.intervalMins * 60 * 1000);
    }

    const msg = await ScheduledMessage.create({ guildId, ...data });
    res.status(201).json(msg);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'A message with that name already exists' });
    console.error('[API] POST messages', err);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

// ── PUT /api/guild/:guildId/messages/:msgId ──────────────────────
router.put('/guild/:guildId/messages/:msgId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, msgId } = req.params;
    const msg = await ScheduledMessage.findOne({ _id: msgId, guildId });
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const data = sanitiseBuilderMsg(req.body);
    msg.content = data.content;
    msg.embeds   = data.embeds;
    msg.actionRows = data.actionRows;

    const prevDelivery = msg.delivery.toObject ? msg.delivery.toObject() : { ...msg.delivery };
    msg.delivery = { ...prevDelivery, ...data.delivery };

    if (data.delivery.type === 'schedule_once' && data.delivery.scheduleAt) {
      msg.delivery.nextRun     = new Date(data.delivery.scheduleAt);
      msg.delivery.scheduleEnabled = true;
    } else if (data.delivery.type === 'schedule_repeat' && data.delivery.intervalMins) {
      if (!msg.delivery.nextRun || new Date(msg.delivery.nextRun) < new Date()) {
        msg.delivery.nextRun = new Date(Date.now() + data.delivery.intervalMins * 60 * 1000);
      }
      msg.delivery.scheduleEnabled = true;
    }

    msg.markModified('delivery');
    msg.markModified('embeds');
    msg.markModified('actionRows');
    await msg.save();
    res.json(msg);
  } catch (err) {
    console.error('[API] PUT messages', err);
    res.status(500).json({ error: 'Failed to update message' });
  }
});

// ── DELETE /api/guild/:guildId/messages/:msgId ───────────────────
router.delete('/guild/:guildId/messages/:msgId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, msgId } = req.params;
    const deleted = await ScheduledMessage.findOneAndDelete({ _id: msgId, guildId });
    if (!deleted) return res.status(404).json({ error: 'Message not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE messages', err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// ── POST /api/guild/:guildId/messages/:msgId/send ─────────────────
router.post('/guild/:guildId/messages/:msgId/send', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, msgId } = req.params;
    const msg = await ScheduledMessage.findOne({ _id: msgId, guildId });
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const payload = buildDiscordPayload(msg);
    if (!payload.content && !payload.embeds?.length) {
      return res.status(400).json({ error: 'Message has no content or embeds to send' });
    }

    if (msg.delivery.type === 'webhook' && msg.delivery.webhookUrl) {
      await discordApi.sendWebhook(msg.delivery.webhookUrl, payload);
    } else {
      const channelId = msg.delivery.channelId || req.body.channelId;
      if (!channelId) return res.status(400).json({ error: 'No channel configured for this message' });

      const sent = await discordApi.postMessage(channelId, payload);

      if (msg.delivery.type === 'sticky') {
        // Delete previous sticky bot message if still there
        if (msg.postedMessageId) {
          await discordApi.deleteMessage(channelId, msg.postedMessageId).catch(() => {});
        }
        msg.postedMessageId = sent.id;
        msg.postedChannelId = channelId;
        await msg.save();
      } else {
        // Save posted message reference for all non-sticky sends
        msg.postedMessageId = sent?.id || null;
        msg.postedChannelId = channelId;
        await msg.save();
      }

      // Seed emoji reactions for any emoji-type action rows
      const emojiRows = (msg.actionRows || []).filter((r) => r.rowType === 'emoji');
      if (emojiRows.length && sent?.id) {
        for (const row of emojiRows) {
          for (const opt of row.options || []) {
            if (opt.label) {
              await discordApi.addReaction(channelId, sent.id, opt.label).catch(() => {});
            }
          }
        }
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[API] POST messages/send', err);
    res.status(500).json({ error: err.message || 'Failed to send message' });
  }
});

// ── POST /api/guild/:guildId/messages/:msgId/attach ─────────────────
// Attaches action rows (components + emoji reactions) to an existing Discord message.
router.post('/guild/:guildId/messages/:msgId/attach', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, msgId } = req.params;
    const { messageUrl } = req.body;

    if (!messageUrl) return res.status(400).json({ error: 'messageUrl is required' });

    const match = String(messageUrl).match(/channels\/(\d+)\/(\d+)\/(\d+)/);
    if (!match) return res.status(400).json({ error: 'Invalid Discord message URL — must include channels/{guildId}/{channelId}/{messageId}' });
    const [, , channelId, discordMsgId] = match;

    const msg = await ScheduledMessage.findOne({ _id: msgId, guildId });
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const hasComponents = (msg.actionRows || []).some((r) => r.rowType !== 'emoji');
    const emojiRows = (msg.actionRows || []).filter((r) => r.rowType === 'emoji');

    if (hasComponents) {
      const components = buildARComponents(msg);
      if (components.length) {
        await discordApi.editMessage(channelId, discordMsgId, { components });
      }
    }

    if (emojiRows.length) {
      for (const row of emojiRows) {
        for (const opt of row.options || []) {
          if (opt.label) {
            await discordApi.addReaction(channelId, discordMsgId, opt.label).catch(() => {});
          }
        }
      }
    }

    if (!hasComponents && !emojiRows.length) {
      return res.status(400).json({ error: 'This message has no action rows to attach' });
    }

    // Save target message reference
    msg.postedMessageId = discordMsgId;
    msg.postedChannelId = channelId;
    await msg.save();

    res.json({ ok: true, messageId: discordMsgId, channelId });
  } catch (err) {
    console.error('[API] POST messages/attach', err);
    res.status(500).json({ error: err.message || 'Failed to attach to message' });
  }
});

// ── POST /api/guild/:guildId/messages/:msgId/toggle-schedule ────────────
router.post('/guild/:guildId/messages/:msgId/toggle-schedule', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, msgId } = req.params;
    const msg = await ScheduledMessage.findOne({ _id: msgId, guildId });
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    msg.delivery.scheduleEnabled = !msg.delivery.scheduleEnabled;
    if (msg.delivery.scheduleEnabled && msg.delivery.type === 'schedule_repeat' && msg.delivery.intervalMins) {
      msg.delivery.nextRun = new Date(Date.now() + msg.delivery.intervalMins * 60 * 1000);
    }
    msg.markModified('delivery');
    await msg.save();
    res.json({ enabled: msg.delivery.scheduleEnabled });
  } catch (err) {
    console.error('[API] toggle-schedule', err);
    res.status(500).json({ error: 'Failed to toggle schedule' });
  }
});

// ── Builder helpers ──────────────────────────────────────────────

function buildDiscordPayload(msg) {
  const embeds = (msg.embeds || []).map((emb) => {
    const obj = {};
    if (emb.title)       obj.title       = emb.title;
    if (emb.description) obj.description = emb.description;
    if (emb.url)         obj.url         = emb.url;
    if (emb.color !== undefined && emb.color !== null) obj.color = emb.color;
    if (emb.authorName)  obj.author  = { name: emb.authorName, icon_url: emb.authorIcon || undefined, url: emb.authorUrl || undefined };
    if (emb.footerText)  obj.footer  = { text: emb.footerText, icon_url: emb.footerIcon || undefined };
    if (emb.imageUrl)    obj.image   = { url: emb.imageUrl };
    if (emb.thumbnail)   obj.thumbnail = { url: emb.thumbnail };
    if (emb.timestamp)   obj.timestamp = new Date().toISOString();
    if (emb.fields?.length) {
      obj.fields = emb.fields.filter((f) => f.name && f.value).map((f) => ({ name: f.name, value: f.value, inline: f.inline || false }));
    }
    return obj;
  }).filter((e) => Object.keys(e).length > 0);

  const result = {};
  if (msg.content) result.content = msg.content;
  if (embeds.length) result.embeds = embeds;

  const components = buildARComponents(msg);
  if (components.length) result.components = components;

  return result;
}

function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try { new URL(url); return url.startsWith('http'); } catch { return false; }
}

function isValidWebhookUrl(url) {
  if (!url) return false;
  return typeof url === 'string' && /^https:\/\/discord(app)?\.com\/api\/webhooks\/\d+\//.test(url);
}

function sanitiseEmbed(emb) {
  if (!emb || typeof emb !== 'object') return null;
  return {
    title:       emb.title       ? String(emb.title).slice(0, 256)  : null,
    description: emb.description ? String(emb.description).slice(0, 4096) : null,
    url:         isValidUrl(emb.url) ? String(emb.url) : null,
    color:       typeof emb.color === 'number' ? emb.color : 0x0f52ba,
    authorName:  emb.authorName  ? String(emb.authorName).slice(0, 256) : null,
    authorIcon:  isValidUrl(emb.authorIcon) ? String(emb.authorIcon) : null,
    authorUrl:   isValidUrl(emb.authorUrl)  ? String(emb.authorUrl)  : null,
    footerText:  emb.footerText  ? String(emb.footerText).slice(0, 2048) : null,
    footerIcon:  isValidUrl(emb.footerIcon) ? String(emb.footerIcon) : null,
    imageUrl:    isValidUrl(emb.imageUrl)   ? String(emb.imageUrl)   : null,
    thumbnail:   isValidUrl(emb.thumbnail)  ? String(emb.thumbnail)  : null,
    timestamp:   emb.timestamp === true,
    fields: Array.isArray(emb.fields)
      ? emb.fields.slice(0, 25).map((f) => ({
          name:   String(f.name  || '').slice(0, 256),
          value:  String(f.value || '').slice(0, 1024),
          inline: f.inline === true,
        })).filter((f) => f.name && f.value)
      : [],
  };
}

function sanitiseDelivery(d) {
  if (!d || typeof d !== 'object') d = {};
  const VALID = ['template', 'channel', 'webhook', 'schedule_once', 'schedule_repeat', 'sticky', 'command', 'ephemeral', 'dm'];
  const type  = VALID.includes(d.type) ? d.type : 'template';
  return {
    type,
    channelId:             d.channelId && /^\d+$/.test(String(d.channelId)) ? String(d.channelId) : null,
    webhookUrl:            isValidWebhookUrl(d.webhookUrl) ? d.webhookUrl : null,
    scheduleAt:            d.scheduleAt ? new Date(d.scheduleAt) : null,
    intervalMins:          typeof d.intervalMins === 'number' && d.intervalMins > 0 ? Math.floor(d.intervalMins) : null,
    scheduleEnabled:       d.scheduleEnabled !== false,
    commandTrigger:        d.commandTrigger ? String(d.commandTrigger).slice(0, 100).trim() : null,
    commandRequiredRoleId: d.commandRequiredRoleId && /^\d+$/.test(String(d.commandRequiredRoleId)) ? String(d.commandRequiredRoleId) : null,
    responseEmbeds:        Array.isArray(d.responseEmbeds) ? d.responseEmbeds.map(sanitiseEmbed).filter(Boolean) : [],
    responseUseCommand:    d.responseUseCommand === true,
  };
}

function sanitiseAROption(o) {
  if (!o || typeof o !== 'object') return null;
  const STYLES = ['primary', 'secondary', 'success', 'danger', 'link'];
  const ACTIONS = ['role', 'message', 'dm'];
  return {
    optId:       o.optId ? String(o.optId).slice(0, 20) : Math.random().toString(36).slice(2, 10).toUpperCase(),
    label:       o.label ? String(o.label).slice(0, 80) : '',
    emoji:       o.emoji ? String(o.emoji).slice(0, 100) : null,
    description: o.description ? String(o.description).slice(0, 100) : null,
    style:       STYLES.includes(o.style) ? o.style : 'primary',
    url:         isValidUrl(o.url) ? String(o.url) : null,
    action:      ACTIONS.includes(o.action) ? o.action : 'role',
    roleId:      o.roleId && /^\d+$/.test(String(o.roleId)) ? String(o.roleId) : null,
    toggleRole:  o.toggleRole !== false,
    content:     o.content ? String(o.content).slice(0, 2000) : null,
    contentType: o.contentType === 'embed' ? 'embed' : 'message',
  };
}

function sanitiseActionRows(rows) {
  if (!Array.isArray(rows)) return [];
  const ROW_TYPES = ['button', 'select', 'emoji'];
  return rows.slice(0, 5).map((row) => {
    if (!row || typeof row !== 'object') return null;
    const rowType = ROW_TYPES.includes(row.rowType) ? row.rowType : 'button';
    const maxOpts = rowType === 'button' ? 5 : 25;
    return {
      rowId:       row.rowId ? String(row.rowId).slice(0, 20) : Math.random().toString(36).slice(2, 10).toUpperCase(),
      rowType,
      placeholder: row.placeholder ? String(row.placeholder).slice(0, 150) : null,
      options:     Array.isArray(row.options) ? row.options.slice(0, maxOpts).map(sanitiseAROption).filter(Boolean) : [],
    };
  }).filter(Boolean);
}

function buildARComponents(msg) {
  const styleMap = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 };
  const components = [];
  const msgId = String(msg._id);

  for (const row of (msg.actionRows || []).slice(0, 5)) {
    if (row.rowType === 'emoji') continue; // emoji rows are reactions, not components

    if (row.rowType === 'button') {
      const buttons = (row.options || []).slice(0, 5)
        .filter((o) => o.label)
        .map((opt) => {
          const style = styleMap[opt.style] || 1;
          const btn = { type: 2, label: opt.label, style };
          if (style === 5) {
            btn.url = opt.url || 'https://discord.com';
          } else {
            btn.custom_id = `msg:btn:${msgId}:${opt.optId}`;
          }
          if (opt.emoji) btn.emoji = parseEmoji(opt.emoji);
          return btn;
        });
      if (buttons.length) components.push({ type: 1, components: buttons });
    } else if (row.rowType === 'select') {
      const options = (row.options || []).slice(0, 25)
        .filter((o) => o.label)
        .map((opt) => {
          const o = { label: opt.label, value: opt.optId };
          if (opt.description) o.description = opt.description;
          if (opt.emoji) o.emoji = parseEmoji(opt.emoji);
          return o;
        });
      if (options.length) {
        components.push({
          type: 1,
          components: [{
            type: 3,
            custom_id: `msg:sel:${msgId}:${row.rowId}`,
            placeholder: row.placeholder || 'Select an option…',
            min_values: 1,
            max_values: 1,
            options,
          }],
        });
      }
    }
  }
  return components;
}

function sanitiseBuilderMsg(data) {
  if (!data || typeof data !== 'object') data = {};
  return {
    name:       data.name ? String(data.name).slice(0, 60).trim() : undefined,
    content:    data.content ? String(data.content).slice(0, 2000) : null,
    embeds:     Array.isArray(data.embeds) ? data.embeds.slice(0, 10).map(sanitiseEmbed).filter(Boolean) : [],
    actionRows: sanitiseActionRows(data.actionRows),
    delivery:   sanitiseDelivery(data.delivery),
  };
}

// ── GET /api/guild/:guildId/embeds ───────────────────────────
router.get('/guild/:guildId/embeds', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const embeds = await EmbedTemplate.find({ guildId: req.params.guildId }).lean();
    res.json(embeds);
  } catch (err) {
    console.error('[API] GET embeds', err);
    res.status(500).json({ error: 'Failed to fetch embeds' });
  }
});

// ── POST /api/guild/:guildId/embeds ──────────────────────────
router.post('/guild/:guildId/embeds', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { name, title, description, color, footer, imageUrl, thumbnailUrl, author, fields } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    const embed = await EmbedTemplate.create({
      guildId,
      name: name.trim(),
      title: title?.trim() || null,
      description: description?.trim() || null,
      color: typeof color === 'number' ? color : 0x0f52ba,
      footer: footer?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      thumbnailUrl: thumbnailUrl?.trim() || null,
      author: author?.trim() || null,
      fields: Array.isArray(fields) ? fields.slice(0, 25) : [],
    });

    res.status(201).json(embed);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An embed with that name already exists' });
    console.error('[API] POST embed', err);
    res.status(500).json({ error: 'Failed to create embed' });
  }
});

// ── PUT /api/guild/:guildId/embeds/:embedId ──────────────────
router.put('/guild/:guildId/embeds/:embedId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, embedId } = req.params;
    const { title, description, color, footer, imageUrl, thumbnailUrl, author, fields } = req.body;

    const embed = await EmbedTemplate.findOneAndUpdate(
      { _id: embedId, guildId },
      {
        $set: {
          title: title?.trim() || null,
          description: description?.trim() || null,
          color: typeof color === 'number' ? color : 0x0f52ba,
          footer: footer?.trim() || null,
          imageUrl: imageUrl?.trim() || null,
          thumbnailUrl: thumbnailUrl?.trim() || null,
          author: author?.trim() || null,
          fields: Array.isArray(fields) ? fields.slice(0, 25) : [],
        },
      },
      { returnDocument: 'after' }
    );

    if (!embed) return res.status(404).json({ error: 'Embed not found' });
    res.json(embed);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An embed with that name already exists' });
    console.error('[API] PUT embed', err);
    res.status(500).json({ error: 'Failed to update embed' });
  }
});

// ── DELETE /api/guild/:guildId/embeds/:embedId ───────────────
router.delete('/guild/:guildId/embeds/:embedId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, embedId } = req.params;
    const deleted = await EmbedTemplate.findOneAndDelete({ _id: embedId, guildId });
    if (!deleted) return res.status(404).json({ error: 'Embed not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE embed', err);
    res.status(500).json({ error: 'Failed to delete embed' });
  }
});

// ── GET /api/guild/:guildId/reaction-roles ───────────────────
router.get('/guild/:guildId/reaction-roles', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const rrs = await ReactionRole.find({ guildId: req.params.guildId }).lean();
    const normalized = rrs.map((rr) => ({
      ...rr,
      options: Array.isArray(rr.options)
        ? rr.options.map((opt) => ({
            ...opt,
            contentType: opt?.contentType === 'embed' ? 'embed' : 'message',
          }))
        : [],
    }));
    res.json(normalized);
  } catch (err) {
    console.error('[API] GET reaction-roles', err);
    res.status(500).json({ error: 'Failed to fetch reaction roles' });
  }
});

// ── POST /api/guild/:guildId/reaction-roles ──────────────────
router.post('/guild/:guildId/reaction-roles', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { name, type, channelId, messageUrl, embedTitle, embedDescription, embedColor, options } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!['button', 'dropdown', 'emoji'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

    const sanitizedOptions = sanitiseOptions(options, type);
    const optionsError = validateOptions(sanitizedOptions, type);
    if (optionsError) return res.status(400).json({ error: optionsError });

    const rr = await ReactionRole.create({
      guildId,
      name: name.trim(),
      type,
      channelId: channelId || null,
      messageUrl: messageUrl || null,
      embedTitle: embedTitle?.trim() || 'Reaction Roles',
      embedDescription: embedDescription?.trim() || 'Click a button or select an option below.',
      embedColor: typeof embedColor === 'number' ? embedColor : 0x0f52ba,
      options: sanitizedOptions,
    });
    res.status(201).json(rr);
  } catch (err) {
    if (err?.name === 'ValidationError') {
      const first = Object.values(err.errors || {})[0];
      return res.status(400).json({ error: first?.message || 'Invalid reaction role data' });
    }
    if (err.code === 11000) return res.status(409).json({ error: 'A reaction role group with that name already exists' });
    console.error('[API] POST reaction-roles', err);
    res.status(500).json({ error: 'Failed to create reaction role group' });
  }
});

// ── PUT /api/guild/:guildId/reaction-roles/:rrId ─────────────
router.put('/guild/:guildId/reaction-roles/:rrId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, rrId } = req.params;
    const { channelId, messageUrl, embedTitle, embedDescription, embedColor, options } = req.body;
    const rr = await ReactionRole.findOne({ _id: rrId, guildId });
    if (!rr) return res.status(404).json({ error: 'Reaction role group not found' });

    if (channelId !== undefined) rr.channelId = channelId || null;
    if (messageUrl !== undefined) rr.messageUrl = messageUrl || null;
    if (embedTitle !== undefined) rr.embedTitle = embedTitle?.trim() || 'Reaction Roles';
    if (embedDescription !== undefined) rr.embedDescription = embedDescription?.trim() || '';
    if (typeof embedColor === 'number') rr.embedColor = embedColor;
    if (Array.isArray(options)) {
      const sanitizedOptions = sanitiseOptions(options, rr.type);
      const optionsError = validateOptions(sanitizedOptions, rr.type);
      if (optionsError) return res.status(400).json({ error: optionsError });
      rr.options = sanitizedOptions;
      rr.markModified('options');
    }
    await rr.save();
    res.json(rr);
  } catch (err) {
    if (err?.name === 'ValidationError') {
      const first = Object.values(err.errors || {})[0];
      return res.status(400).json({ error: first?.message || 'Invalid reaction role data' });
    }
    console.error('[API] PUT reaction-roles', err);
    res.status(500).json({ error: 'Failed to update reaction role group' });
  }
});

// ── DELETE /api/guild/:guildId/reaction-roles/:rrId ──────────
router.delete('/guild/:guildId/reaction-roles/:rrId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, rrId } = req.params;
    const rr = await ReactionRole.findOneAndDelete({ _id: rrId, guildId });
    if (!rr) return res.status(404).json({ error: 'Reaction role group not found' });

    // Clean up the Discord message if it exists
    if (rr.channelId && rr.messageId) {
      try { await discordApi.deleteMessage(rr.channelId, rr.messageId); } catch (_) {}
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE reaction-roles', err);
    res.status(500).json({ error: 'Failed to delete reaction role group' });
  }
});

// ── POST /api/guild/:guildId/reaction-roles/:rrId/post ───────
// Posts (or re-posts) the reaction role message to Discord.
router.post('/guild/:guildId/reaction-roles/:rrId/post', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, rrId } = req.params;
    const rr = await ReactionRole.findOne({ _id: rrId, guildId });
    if (!rr) return res.status(404).json({ error: 'Reaction role group not found' });

    if (rr.type === 'emoji') {
      // For emoji type: resolve message URL and seed reactions
      const url = rr.messageUrl;
      if (!url) return res.status(400).json({ error: 'No message URL set for emoji reaction role' });
      const match = url.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
      if (!match) return res.status(400).json({ error: 'Invalid Discord message URL' });
      const [, , chanId, msgId] = match;
      rr.externalChannelId = chanId;
      rr.externalMessageId = msgId;
      await rr.save();

      // Seed reactions so users know what to react with
      for (const opt of rr.options) {
        if (opt.label) {
          try { await discordApi.addReaction(chanId, msgId, opt.label); } catch (_) {}
        }
      }
      return res.json({ ok: true, messageId: msgId });
    }

    // button / dropdown — post or update the bot's message
    if (!rr.channelId) return res.status(400).json({ error: 'No channel set for this reaction role group' });

    const body = buildMessageBody(rr);

    let postedMessage;
    if (rr.messageId) {
      // Edit existing message
      try {
        postedMessage = await discordApi.editMessage(rr.channelId, rr.messageId, body);
      } catch (editErr) {
        // If edit failed (message deleted etc.), post a new one
        postedMessage = await discordApi.postMessage(rr.channelId, body);
      }
    } else {
      postedMessage = await discordApi.postMessage(rr.channelId, body);
    }

    rr.messageId = postedMessage.id;
    await rr.save();
    res.json({ ok: true, messageId: postedMessage.id });
  } catch (err) {
    console.error('[API] POST reaction-roles/post', err);
    res.status(500).json({ error: err.message || 'Failed to post reaction role message' });
  }
});

// ── Helpers ──────────────────────────────────────────────────
function sanitiseOptions(raw, type) {
  if (!Array.isArray(raw)) return [];
  const normalizeContentType = (value) => {
    const normalized = String(value || 'message').toLowerCase();
    return normalized === 'embed' ? 'embed' : 'message';
  };

  return raw.slice(0, type === 'dropdown' ? 25 : 25).map((o) => ({
    optId:       String(o.optId || generateOptId()),
    label:       String(o.label || '').slice(0, 80),
    emoji:       o.emoji ? String(o.emoji).slice(0, 100) : null,
    description: o.description ? String(o.description).slice(0, 100) : null,
    style:       ['primary', 'secondary', 'success', 'danger'].includes(o.style) ? o.style : 'primary',
    action:      ['role', 'message', 'dm'].includes(o.action) ? o.action : 'role',
    contentType: normalizeContentType(o.contentType),
    roleId:      o.roleId ? String(o.roleId) : null,
    toggleRole:  o.toggleRole !== false,
    content:     o.content ? String(o.content).slice(0, 2000) : null,
  }));
}

function generateOptId() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function validateOptions(options, type) {
  if (!Array.isArray(options) || !options.length) {
    return 'Add at least one option before saving.';
  }

  for (let i = 0; i < options.length; i += 1) {
    const opt = options[i];
    const n = i + 1;

    if (!opt.label) {
      return type === 'emoji'
        ? `Option ${n}: Emoji is required.`
        : `Option ${n}: Label is required.`;
    }

    if (opt.action === 'role' && !opt.roleId) {
      return `Option ${n}: Select a role for the role action.`;
    }

    if ((opt.action === 'message' || opt.action === 'dm') && !opt.content) {
      return `Option ${n}: Message content is required for ${opt.action.toUpperCase()} action.`;
    }
  }

  return null;
}

function buildMessageBody(rr) {
  const embeds = (rr.embedTitle || rr.embedDescription) ? [{
    title:       rr.embedTitle || undefined,
    description: rr.embedDescription || undefined,
    color:       rr.embedColor ?? 0x0f52ba,
  }] : [];

  const components = [];

  if (rr.type === 'button') {
    const styleMap = { primary: 1, secondary: 2, success: 3, danger: 4 };
    const buttons = rr.options.map((opt) => {
      const btn = {
        type:      2,
        custom_id: `rr:btn:${rr._id}:${opt.optId}`,
        label:     opt.label,
        style:     styleMap[opt.style] || 1,
      };
      if (opt.emoji) btn.emoji = parseEmoji(opt.emoji);
      return btn;
    });
    // Chunk into rows of 5
    for (let i = 0; i < buttons.length; i += 5) {
      components.push({ type: 1, components: buttons.slice(i, i + 5) });
    }
  } else if (rr.type === 'dropdown') {
    const menuOptions = rr.options.map((opt) => {
      const o = { label: opt.label, value: opt.optId };
      if (opt.description) o.description = opt.description;
      if (opt.emoji) o.emoji = parseEmoji(opt.emoji);
      return o;
    });
    components.push({
      type: 1,
      components: [{
        type:        3,
        custom_id:   `rr:sel:${rr._id}`,
        placeholder: 'Select an option…',
        min_values:  1,
        max_values:  1,
        options:     menuOptions,
      }],
    });
  }

  return {
    embeds:     embeds.length ? embeds : undefined,
    components: components.length ? components : [],
  };
}

function parseEmoji(emoji) {
  const custom = emoji.match(/^<a?:([^:]+):(\d+)>$/);
  if (custom) return { name: custom[1], id: custom[2] };
  return { name: emoji };
}

// ── GET /api/guild/:guildId/modconfig ────────────────────────
router.get('/guild/:guildId/modconfig', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const config = await GuildConfig.findOne({ guildId: req.params.guildId });
    res.json({
      moderatorRoleId:    config?.moderation?.moderatorRoleId    ?? null,
      auditLogChannelId:  config?.moderation?.auditLogChannelId  ?? null,
    });
  } catch (err) {
    console.error('[API] GET modconfig', err);
    res.status(500).json({ error: 'Failed to fetch mod config' });
  }
});

// ── PATCH /api/guild/:guildId/modconfig ──────────────────────
router.patch('/guild/:guildId/modconfig', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { moderatorRoleId, auditLogChannelId } = req.body;
    const update = {};
    if (moderatorRoleId !== undefined) {
      update['moderation.moderatorRoleId'] = (typeof moderatorRoleId === 'string' && /^\d+$/.test(moderatorRoleId)) ? moderatorRoleId : null;
    }
    if (auditLogChannelId !== undefined) {
      update['moderation.auditLogChannelId'] = (typeof auditLogChannelId === 'string' && /^\d+$/.test(auditLogChannelId)) ? auditLogChannelId : null;
    }
    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update' });
    await GuildConfig.findOneAndUpdate({ guildId }, { $set: update }, { upsert: true });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] PATCH modconfig', err);
    res.status(500).json({ error: 'Failed to update mod config' });
  }
});

module.exports = router;

const express = require('express');
const path = require('path');
const router = express.Router();

const { GuildConfig } = require('../models/GuildConfig');
const discordApi = require('../lib/discord');

// All bot command metadata (name → { category, description, usage, aliases })
const COMMAND_META = require(path.join(__dirname, '../../../bot/src/commands/meta.js'));

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
      { upsert: true, new: true, setDefaultsOnInsert: true }
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

    // Load the actual command JSON from the bot
    const botCommandPath = path.join(__dirname, '../../../bot/src/commands');
    let commandData = null;
    try {
      commandData = findCommandData(botCommandPath, name);
    } catch (e) {
      return res.status(500).json({ error: 'Could not load command data from bot' });
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
      { upsert: true, new: true, setDefaultsOnInsert: true }
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
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const cmdSettings = config.commandSettings?.get(name);
    if (cmdSettings?.discordCommandId && req.body.customDescription !== undefined) {
      const botCommandPath = path.join(__dirname, '../../../bot/src/commands');
      try {
        const commandData = findCommandData(botCommandPath, name);
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

// ── Helper: find and return a command's .toJSON() data ────────
const fs = require('fs');
function findCommandData(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      try { return findCommandData(full, name); } catch (_) {}
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      delete require.cache[require.resolve(full)];
      const cmd = require(full);
      if (cmd?.data?.name === name && cmd.data.toJSON) return cmd.data.toJSON();
    }
  }
  throw new Error(`Command "${name}" not found`);
}

module.exports = router;

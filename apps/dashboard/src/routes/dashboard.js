const express = require('express');
const router = express.Router();

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.redirect('/auth/discord');
}

function hasAdmin(permissions) {
  try {
    return (BigInt(permissions) & 0x8n) !== 0n;
  } catch {
    return false;
  }
}

// Server list
router.get('/', requireAuth, (req, res) => {
  const guilds = req.user.guilds || [];
  const adminGuilds = guilds.filter((g) => hasAdmin(g.permissions));
  res.render('dashboard', { guilds: adminGuilds });
});

// Server detail
router.get('/:guildId', requireAuth, (req, res) => {
  const { guildId } = req.params;
  // Basic validation: Discord snowflakes are numeric strings
  if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');

  const guilds = req.user.guilds || [];
  const guild = guilds.find((g) => g.id === guildId && hasAdmin(g.permissions));
  if (!guild) return res.redirect('/dashboard');

  res.render('server', { guild });
});

module.exports = router;

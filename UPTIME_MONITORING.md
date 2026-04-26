# Uptime Monitoring Feature - Implementation Guide

## Overview
The uptime monitoring system automatically detects Discord bot and website status changes, posting and editing a status message in the Flynn support server (channel: 1272158892318785577).

## How It Works

### 1. Bot Status Detection

**Online Detection:**
- When the bot starts or reconnects, the `ready` event fires
- Event handler: `src/events/botReady.js`
- Updates database: `botStatus = "online"`
- Posts/edits status message in support channel

**Offline Detection:**
- When the bot loses connection, the `shardDisconnect` event fires
- Event handler: `src/events/botDisconnect.js`
- Updates database: `botStatus = "offline"`
- Posts/edits status message in support channel before full disconnect

### 2. Website Status Detection

**Periodic Checking:**
- Scheduler runs health check every 5 minutes
- File: `src/lib/scheduler.js` - `runHealthCheck()` function
- Makes HTTP HEAD request to: `https://flynnbot-dashboard.onrender.com`
- Response status 200 = online, any other = offline

**Status Change Detection:**
- Compares current website status with previous status in database
- Only posts/edits message if website status actually changed
- Prevents message spam from repeated checks

### 3. Message Management

**Initial Post:**
- First time health check runs (10 seconds after bot startup)
- Posts embed to channel 1272158892318785577
- Stores message ID in database for later editing

**Status Updates:**
- When bot or website status changes, edits the same message
- Uses stored message ID to find and update the message
- Handles case where message was deleted by admin (posts new one)

### 4. Embed Display

Shows two status fields:
```
Discord Bot:  ✅ Online   or   ⚠️ Offline
Website:      ✅ Online   or   ❌ Offline
```

---

## Testing the Feature

### Test 1: Bot Startup (Automatic)
**Action:** Start the bot
**Expected Behavior:**
1. Bot loads and connects to Discord
2. After ~10 seconds, status message appears in channel 1272158892318785577
3. Shows: ✅ Bot: Online | ✅ Website: Online
4. Console logs: `[HealthCheck] Bot came online`

### Test 2: Website Down (Manual)
**Action:** 
1. Stop the website (https://flynnbot-dashboard.onrender.com)
2. Wait up to 5 minutes for next health check
3. Website will be detected as offline

**Expected Behavior:**
1. Status message edits to show: ✅ Bot: Online | ❌ Website: Offline
2. Console logs: `[HealthCheck] Website status changed: online → offline`

### Test 3: Website Back Up (Manual)
**Action:**
1. Restart the website
2. Wait up to 5 minutes for next health check

**Expected Behavior:**
1. Status message edits back to: ✅ Bot: Online | ✅ Website: Online
2. Console logs: `[HealthCheck] Website status changed: offline → online`

### Test 4: Bot Disconnect (Manual)
**Action:**
1. Forcefully stop the bot process (Ctrl+C or kill -9)
2. Immediately after shutdown, status message should update

**Expected Behavior:**
1. Before disconnect completes, message edits to: ⚠️ Bot: Offline | [website status]
2. Console logs (before shutdown): `[HealthCheck] Bot went offline`

### Test 5: Bot Reconnect (Manual)
**Action:**
1. Restart the bot after it was stopped

**Expected Behavior:**
1. Bot connects and fires ready event
2. Status message edits to show bot back online: ✅ Bot: Online | [website status]
3. Console logs: `[HealthCheck] Bot came online`

---

## Database Schema (HealthStatus Collection)

```javascript
{
  guildId: "1272158852606324766",           // Flynn support server
  channelId: "1272158892318785577",         // Target channel
  botStatus: "online" | "offline",          // Current bot status
  websiteStatus: "online" | "offline",      // Current website status
  messageId: "123456789...",                // ID of status message (for editing)
  lastBotStatusChange: Date,                // When bot status last changed
  lastWebsiteStatusChange: Date,            // When website status last changed
  lastChecked: Date,                        // When last health check ran
  recentChecks: [                           // Last 10 checks for debugging
    {
      timestamp: Date,
      botOnline: Boolean,
      websiteOnline: Boolean
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

---

## File Structure

```
apps/bot/src/
├── models/
│   └── HealthStatus.js           (NEW) Mongoose model for status tracking
├── events/
│   ├── botReady.js               (NEW) Handles bot coming online
│   ├── botDisconnect.js          (NEW) Handles bot going offline
│   └── [other events...]
├── lib/
│   ├── scheduler.js              (MODIFIED) Added health check routine
│   └── [other libraries...]
└── commands/
    └── [commands...]
```

---

## Configuration

The feature uses these hardcoded values (for Flynn support server only):

| Setting | Value | Location |
|---------|-------|----------|
| Support Guild ID | `1272158852606324766` | botReady.js, botDisconnect.js, scheduler.js |
| Support Channel ID | `1272158892318785577` | botReady.js, botDisconnect.js, scheduler.js |
| Website URL | `https://flynnbot-dashboard.onrender.com` | scheduler.js |
| Check Interval | 5 minutes (300,000ms) | scheduler.js |
| Initial Check | 10 seconds after startup | scheduler.js |
| Check Timeout | 5 seconds | scheduler.js |

To use for a different server, update the hardcoded IDs in these files.

---

## Error Handling

The feature handles these edge cases:

| Scenario | Handling |
|----------|----------|
| Channel deleted | Logs warning, saves status to DB but doesn't post |
| Message deleted | Detects deletion and posts new status message |
| Website unreachable | Treats as offline status |
| Database error | Catches and logs error, continues running |
| HTTP fetch timeout | Treats as offline status (5s timeout) |
| Message edit fails | Logs warning and tries again next check |
| Bot loses connection mid-message | Database already updated, message will retry on reconnect |

---

## Monitoring

**Console Output Indicators:**

```
[HealthCheck] Bot came online                              ← Bot connected
[HealthCheck] Bot went offline (shardDisconnect)           ← Bot disconnected
[HealthCheck] Website status changed: online → offline     ← Website down
[HealthCheck] Website status changed: offline → online     ← Website up
[HealthCheck] Channel not found or not text-based          ← Config issue
[HealthCheck] Error: [error message]                       ← Something failed
```

**Database Checks:**

Connect to MongoDB and query:
```javascript
db.healthstatuses.findOne({ guildId: "1272158852606324766" })
```

Shows current status, message ID, and recent check history.

---

## Production Checklist

- [x] Model created and properly exports
- [x] Event handlers created and will auto-load
- [x] Scheduler integration complete
- [x] All imports/exports correct
- [x] Error handling comprehensive
- [x] Database schema validated
- [x] Hardcoded to Flynn support server only
- [x] No syntax errors
- [x] Bot loads successfully with health check running
- [x] All verification checks passed

Feature is ready for immediate use.

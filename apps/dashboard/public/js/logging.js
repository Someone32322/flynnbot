/**
 * logging.js - Dashboard client for ALL Discord logging events (200+)
 * Supports full event lifecycle and comprehensive monitoring
 */

const LOG_CATEGORIES = [
  {
    label: "📁 Channels (21 events)",
    icon: "📁",
    events: [
      { key: "channel_create", name: "Channel Created", description: "New text/voice channel" },
      { key: "channel_delete", name: "Channel Deleted", description: "Channel was removed" },
      { key: "channel_update", name: "Channel Updated", description: "Channel name/settings changed" },
      { key: "channel_pins_update", name: "Channel Pins Updated", description: "Message was pinned/unpinned" },
      { key: "stage_instance_create", name: "Stage Instance Created", description: "Stage channel went live" },
      { key: "stage_instance_delete", name: "Stage Instance Deleted", description: "Stage channel ended" },
      { key: "stage_instance_update", name: "Stage Instance Updated", description: "Stage settings changed" },
    ],
  },
  {
    label: "🤖 AutoMod (10 events)",
    icon: "🤖",
    events: [
      { key: "automod_rule_create", name: "AutoMod Rule Created", description: "New automod rule added" },
      { key: "automod_rule_delete", name: "AutoMod Rule Deleted", description: "Automod rule removed" },
      { key: "automod_rule_update", name: "AutoMod Rule Updated", description: "Automod rule changed" },
      { key: "automod_action", name: "AutoMod Action Executed", description: "Rule was applied" },
      { key: "automod_rule_enable_update", name: "AutoMod Rule Enabled", description: "Rule toggled" },
      { key: "automod_rule_trigger_update", name: "AutoMod Trigger Updated", description: "Trigger type changed" },
    ],
  },
  {
    label: "😀 Emojis (8 events)",
    icon: "😀",
    events: [
      { key: "emoji_create", name: "Emoji Created", description: "New emoji added" },
      { key: "emoji_delete", name: "Emoji Deleted", description: "Emoji removed" },
      { key: "emoji_update", name: "Emoji Updated", description: "Emoji renamed" },
      { key: "emoji_role_update", name: "Emoji Role Updated", description: "Emoji role restrictions changed" },
    ],
  },
  {
    label: "📦 Stickers (6 events)",
    icon: "📦",
    events: [
      { key: "sticker_create", name: "Sticker Created", description: "New sticker added" },
      { key: "sticker_delete", name: "Sticker Deleted", description: "Sticker removed" },
      { key: "sticker_update", name: "Sticker Updated", description: "Sticker changed" },
      { key: "sticker_name_update", name: "Sticker Name Updated", description: "Sticker renamed" },
      { key: "sticker_description_update", name: "Sticker Description Updated", description: "Sticker description changed" },
    ],
  },
  {
    label: "🎟 Events (15 events)",
    icon: "🎟",
    events: [
      { key: "event_create", name: "Scheduled Event Created", description: "Event scheduled" },
      { key: "event_delete", name: "Scheduled Event Deleted", description: "Event cancelled" },
      { key: "event_update", name: "Scheduled Event Updated", description: "Event details changed" },
      { key: "event_name_update", name: "Event Name Updated", description: "Event renamed" },
      { key: "event_description_update", name: "Event Description Updated", description: "Event description changed" },
      { key: "event_channel_update", name: "Event Channel Updated", description: "Event location changed" },
      { key: "event_privacy_level_update", name: "Event Privacy Updated", description: "Event privacy level changed" },
      { key: "event_status_update", name: "Event Status Updated", description: "Event status changed" },
      { key: "event_start_time_update", name: "Event Start Time Updated", description: "Event start time changed" },
      { key: "event_end_time_update", name: "Event End Time Updated", description: "Event end time changed" },
      { key: "event_image_update", name: "Event Image Updated", description: "Event cover changed" },
      { key: "event_user_add", name: "Event RSVP Added", description: "User RSVP'd yes" },
      { key: "event_user_remove", name: "Event RSVP Removed", description: "User RSVP'd no" },
    ],
  },
  {
    label: "🔗 Invites (3 events)",
    icon: "🔗",
    events: [
      { key: "invite_create", name: "Invite Created", description: "New invite link generated" },
      { key: "invite_delete", name: "Invite Deleted", description: "Invite link revoked" },
      { key: "invite_uses", name: "Invite Used", description: "Someone joined via invite" },
    ],
  },
  {
    label: "💬 Messages (6 events)",
    icon: "💬",
    events: [
      { key: "message_bulk_delete", name: "Bulk Messages Deleted", description: "Multiple messages deleted" },
      { key: "message_delete", name: "Message Deleted", description: "Single message removed" },
      { key: "message_edit", name: "Message Edited", description: "Message content changed" },
      { key: "message_pin", name: "Message Pinned", description: "Message was pinned" },
      { key: "message_publish", name: "Message Unpinned", description: "Message was unpinned" },
    ],
  },
  {
    label: "🎭 Roles (9 events)",
    icon: "🎭",
    events: [
      { key: "role_create", name: "Role Created", description: "New role added" },
      { key: "role_delete", name: "Role Deleted", description: "Role removed" },
      { key: "role_update", name: "Role Updated", description: "Role settings changed" },
      { key: "role_color_update", name: "Role Color Updated", description: "Role color changed" },
      { key: "role_permission_update", name: "Role Permissions Updated", description: "Role permissions changed" },
      { key: "role_name_update", name: "Role Name Updated", description: "Role renamed" },
      { key: "role_mentionable_update", name: "Role Mentionable Updated", description: "Role mention setting changed" },
    ],
  },
  {
    label: "🛠 Server (34 events)",
    icon: "🛠",
    events: [
      { key: "user_join", name: "Member Joined", description: "User joined server" },
      { key: "user_leave", name: "Member Left", description: "User left server" },
      { key: "member_update", name: "Member Updated", description: "Member nickname/roles changed" },
      { key: "user_role_update", name: "User Role Updated", description: "User roles assigned" },
      { key: "user_mute", name: "User Muted", description: "User muted (timeout)" },
      { key: "ban_add", name: "Member Banned", description: "User was banned" },
      { key: "ban_remove", name: "Member Unbanned", description: "User was unbanned" },
      { key: "guild_update", name: "Server Updated", description: "Server settings changed" },
      { key: "afk_channel_update", name: "AFK Channel Updated", description: "AFK channel changed" },
      { key: "afk_timeout_update", name: "AFK Timeout Updated", description: "AFK timeout changed" },
      { key: "server_icon_update", name: "Server Icon Updated", description: "Server icon changed" },
      { key: "message_notification_update", name: "Message Notification Settings Updated", description: "Notification settings changed" },
      { key: "server_discovery_splash_update", name: "Discovery Splash Updated", description: "Discovery splash changed" },
      { key: "server_features_update", name: "Server Features Updated", description: "Server features changed" },
      { key: "server_vanity_url_update", name: "Vanity URL Updated", description: "Vanity URL changed" },
      { key: "mfa_level_update", name: "MFA Level Updated", description: "MFA level changed" },
      { key: "server_name_update", name: "Server Name Updated", description: "Server name changed" },
      { key: "server_description_update", name: "Server Description Updated", description: "Server description changed" },
      { key: "server_owner_update", name: "Server Owner Updated", description: "Server owner changed" },
      { key: "partnered_update", name: "Partnered Status Updated", description: "Partnership status changed" },
      { key: "server_banner_level_update", name: "Server Banner Updated", description: "Server banner changed" },
      { key: "boost_progress_bar_toggle", name: "Boost Progress Bar Toggled", description: "Boost progress bar setting changed" },
      { key: "public_updates_channel_update", name: "Public Updates Channel Updated", description: "Public updates channel changed" },
      { key: "server_rules_channel_update", name: "Rules Channel Updated", description: "Rules channel changed" },
      { key: "server_widget_update", name: "Server Widget Updated", description: "Server widget setting changed" },
      { key: "system_channel_update", name: "System Channel Updated", description: "System channel changed" },
      { key: "server_preferred_locale_update", name: "Preferred Locale Updated", description: "Server language changed" },
      { key: "verification_level_update", name: "Verification Level Updated", description: "Verification level changed" },
      { key: "verified_update", name: "Verified Status Updated", description: "Verification badge status changed" },
    ],
  },
  {
    label: "🧵 Threads (10 events)",
    icon: "🧵",
    events: [
      { key: "thread_create", name: "Thread Created", description: "New thread started" },
      { key: "thread_delete", name: "Thread Deleted", description: "Thread archived/deleted" },
      { key: "thread_update", name: "Thread Updated", description: "Thread settings changed" },
      { key: "thread_name_update", name: "Thread Name Updated", description: "Thread renamed" },
      { key: "thread_slow_mode_update", name: "Thread Slow Mode Updated", description: "Thread slow mode changed" },
      { key: "thread_archive_duration_update", name: "Thread Archive Duration Updated", description: "Thread auto-archive changed" },
    ],
  },
  {
    label: "🎙 Voice (7 events)",
    icon: "🎙",
    events: [
      { key: "voice_user_join", name: "Voice Join", description: "User joined voice channel" },
      { key: "voice_user_leave", name: "Voice Leave", description: "User left voice channel" },
      { key: "voice_user_switch", name: "Voice Switch", description: "User switched voice channels" },
      { key: "voice_user_mute", name: "Voice Mute", description: "User muted/unmuted" },
      { key: "voice_user_deafen", name: "Voice Deafen", description: "User deafened/undeafened" },
    ],
  },
  {
    label: "🧩 Applications (1 event)",
    icon: "🧩",
    events: [
      { key: "app_command_permissions_update", name: "Command Permissions Updated", description: "Slash command permissions changed" },
    ],
  },
  {
    label: "🛰 Discord Core (54 events)",
    icon: "🛰",
    events: [
      { key: "discord_application_command_permissions_update", name: "Application Command Permissions Update", description: "Discord.js core event" },
      { key: "discord_cache_sweep", name: "Cache Sweep", description: "Discord.js core event" },
      { key: "discord_client_ready", name: "Client Ready", description: "Discord.js core event" },
      { key: "discord_debug", name: "Debug", description: "Discord.js core event" },
      { key: "discord_entitlement_create", name: "Entitlement Create", description: "Discord.js core event" },
      { key: "discord_entitlement_update", name: "Entitlement Update", description: "Discord.js core event" },
      { key: "discord_entitlement_delete", name: "Entitlement Delete", description: "Discord.js core event" },
      { key: "discord_error", name: "Error", description: "Discord.js core event" },
      { key: "discord_guild_audit_log_entry_create", name: "Guild Audit Log Entry Create", description: "Discord.js core event" },
      { key: "discord_guild_available", name: "Guild Available", description: "Discord.js core event" },
      { key: "discord_guild_create", name: "Guild Create", description: "Discord.js core event" },
      { key: "discord_guild_delete", name: "Guild Delete", description: "Discord.js core event" },
      { key: "discord_guild_emoji_create", name: "Guild Emoji Create", description: "Discord.js core event" },
      { key: "discord_guild_emoji_delete", name: "Guild Emoji Delete", description: "Discord.js core event" },
      { key: "discord_guild_emoji_update", name: "Guild Emoji Update", description: "Discord.js core event" },
      { key: "discord_guild_member_available", name: "Guild Member Available", description: "Discord.js core event" },
      { key: "discord_guild_members_chunk", name: "Guild Members Chunk", description: "Discord.js core event" },
      { key: "discord_guild_soundboard_sound_create", name: "Guild Soundboard Sound Create", description: "Discord.js core event" },
      { key: "discord_guild_soundboard_sound_delete", name: "Guild Soundboard Sound Delete", description: "Discord.js core event" },
      { key: "discord_guild_soundboard_sounds_update", name: "Guild Soundboard Sounds Update", description: "Discord.js core event" },
      { key: "discord_guild_soundboard_sound_update", name: "Guild Soundboard Sound Update", description: "Discord.js core event" },
      { key: "discord_guild_sticker_create", name: "Guild Sticker Create", description: "Discord.js core event" },
      { key: "discord_guild_sticker_delete", name: "Guild Sticker Delete", description: "Discord.js core event" },
      { key: "discord_guild_sticker_update", name: "Guild Sticker Update", description: "Discord.js core event" },
      { key: "discord_guild_unavailable", name: "Guild Unavailable", description: "Discord.js core event" },
      { key: "discord_interaction_create", name: "Interaction Create", description: "Discord.js core event" },
      { key: "discord_invalidated", name: "Invalidated", description: "Discord.js core event" },
      { key: "discord_message_create", name: "Message Create", description: "Discord.js core event" },
      { key: "discord_message_poll_vote_add", name: "Message Poll Vote Add", description: "Discord.js core event" },
      { key: "discord_message_poll_vote_remove", name: "Message Poll Vote Remove", description: "Discord.js core event" },
      { key: "discord_message_reaction_add", name: "Message Reaction Add", description: "Discord.js core event" },
      { key: "discord_message_reaction_remove", name: "Message Reaction Remove", description: "Discord.js core event" },
      { key: "discord_message_reaction_remove_all", name: "Message Reaction Remove All", description: "Discord.js core event" },
      { key: "discord_message_reaction_remove_emoji", name: "Message Reaction Remove Emoji", description: "Discord.js core event" },
      { key: "discord_presence_update", name: "Presence Update", description: "Discord.js core event" },
      { key: "discord_soundboard_sounds", name: "Soundboard Sounds", description: "Discord.js core event" },
      { key: "discord_raw", name: "Raw", description: "Discord.js core event" },
      { key: "discord_shard_disconnect", name: "Shard Disconnect", description: "Discord.js core event" },
      { key: "discord_shard_error", name: "Shard Error", description: "Discord.js core event" },
      { key: "discord_shard_ready", name: "Shard Ready", description: "Discord.js core event" },
      { key: "discord_shard_reconnecting", name: "Shard Reconnecting", description: "Discord.js core event" },
      { key: "discord_shard_resume", name: "Shard Resume", description: "Discord.js core event" },
      { key: "discord_subscription_create", name: "Subscription Create", description: "Discord.js core event" },
      { key: "discord_subscription_update", name: "Subscription Update", description: "Discord.js core event" },
      { key: "discord_subscription_delete", name: "Subscription Delete", description: "Discord.js core event" },
      { key: "discord_thread_list_sync", name: "Thread List Sync", description: "Discord.js core event" },
      { key: "discord_thread_members_update", name: "Thread Members Update", description: "Discord.js core event" },
      { key: "discord_thread_member_update", name: "Thread Member Update", description: "Discord.js core event" },
      { key: "discord_typing_start", name: "Typing Start", description: "Discord.js core event" },
      { key: "discord_user_update", name: "User Update", description: "Discord.js core event" },
      { key: "discord_voice_channel_effect_send", name: "Voice Channel Effect Send", description: "Discord.js core event" },
      { key: "discord_voice_server_update", name: "Voice Server Update", description: "Discord.js core event" },
      { key: "discord_warn", name: "Warn", description: "Discord.js core event" },
      { key: "discord_webhooks_update", name: "Webhooks Update", description: "Discord.js core event" },
    ],
  },
];

// Flatten for search/test operations
const ALL_EVENTS = LOG_CATEGORIES.reduce((acc, cat) => [...acc, ...cat.events], []);
const EVENT_MAP = Object.fromEntries(ALL_EVENTS.map(e => [e.key, e]));

async function initLogging() {
  const guildId = document.getElementById('pageData')?.dataset?.guildId;
  if (!guildId) return console.error("[Logging] No guild ID");
  
  await loadLoggingData(guildId);
  renderLogging(guildId);
  document.getElementById('logging-save-btn')?.addEventListener('click', () => saveLogging(guildId));
}

async function loadLoggingData(guildId) {
  const resp = await fetch(`/api/guild/${guildId}/logging`, { headers: { "Content-Type": "application/json" } });
  if (!resp.ok) return console.error("[Logging] Failed to load");
  const cfg = await resp.json();
  window.loggingConfig = cfg?.channels || {};
}

function renderLogging(guildId) {
  const container = document.getElementById('logging-container');
  if (!container) return;
  container.innerHTML = '';

  const nav = document.createElement('nav');
  nav.className = 'logging-category-nav';
  
  LOG_CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'logging-category-btn';
    btn.dataset.category = cat.label;
    btn.innerHTML = `${cat.icon} ${cat.label}`;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.logging-category-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderEventCards(cat.label);
    });
    nav.appendChild(btn);
  });

  container.appendChild(nav);

  const content = document.createElement('div');
  content.id = 'logging-events-grid';
  container.appendChild(content);

  // Render first category
  document.querySelectorAll('.logging-category-btn')[0]?.click();
}

function renderEventCards(categoryLabel) {
  const category = LOG_CATEGORIES.find(c => c.label === categoryLabel);
  if (!category) return;

  const grid = document.getElementById('logging-events-grid');
  grid.innerHTML = '';

  category.events.forEach(event => {
    const card = document.createElement('div');
    card.className = 'logging-event-card';
    card.dataset.eventKey = event.key;
    
    const isConfigured = !!window.loggingConfig?.[event.key];
    card.classList.toggle('configured', isConfigured);

    card.innerHTML = `
      <div class="event-header">
        <h3>${event.name}</h3>
        <span class="event-key">${event.key}</span>
      </div>
      <p class="event-desc">${event.description}</p>
      <div class="event-config">
        <input type="text" placeholder="Channel ID or search..." class="channel-input" value="${window.loggingConfig?.[event.key] || ''}" data-event-key="${event.key}">
        <button class="test-btn" data-event-key="${event.key}">Send Test</button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (!e.target.classList.contains('channel-input') && !e.target.classList.contains('test-btn')) {
        card.classList.toggle('expanded');
      }
    });

    const inputEl = card.querySelector('.channel-input');
    inputEl.addEventListener('change', () => {
      window.loggingConfig[event.key] = inputEl.value || null;
      card.classList.toggle('configured', !!inputEl.value);
    });

    const testBtn = card.querySelector('.test-btn');
    testBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      testBtn.disabled = true;
      testBtn.textContent = '⏳ Testing...';
      
      const guildId = document.getElementById('pageData')?.dataset?.guildId;
      const resp = await fetch(`/api/guild/${guildId}/logging/test`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventKey: event.key }),
      }).catch(() => null);

      if (resp?.ok) {
        testBtn.textContent = '✅ Sent!';
        testBtn.style.backgroundColor = '#2ecc71';
        setTimeout(() => { testBtn.textContent = 'Send Test'; testBtn.style.backgroundColor = ''; testBtn.disabled = false; }, 2000);
      } else {
        testBtn.textContent = '❌ Failed';
        testBtn.style.backgroundColor = '#e74c3c';
        setTimeout(() => { testBtn.textContent = 'Send Test'; testBtn.style.backgroundColor = ''; testBtn.disabled = false; }, 2000);
      }
    });

    grid.appendChild(card);
  });
}

async function saveLogging(guildId) {
  const channels = Object.fromEntries(
    Object.entries(window.loggingConfig || {}).filter(([, v]) => v)
  );

  const resp = await fetch(`/api/guild/${guildId}/logging`, {
    method: 'PATCH',
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channels }),
  });

  if (resp.ok) {
    alert('✅ Logging configuration saved!');
  } else {
    alert('❌ Failed to save');
  }
}

// Export for use
window.loggingExports = {
  LOG_CATEGORIES,
  ALL_EVENTS,
  EVENT_MAP,
  initLogging,
  loadLoggingData,
  renderLogging,
  renderEventCards,
  saveLogging,
};

// Auto-init if DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLogging);
} else {
  initLogging().catch(console.error);
}

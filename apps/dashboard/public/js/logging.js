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

let _loggingInitDone = false;
let _channelOptions = [];
let _bulkSelectMode = false;
let _testButtonsEnabled = true;

function getLoggingContainer() {
  return document.getElementById('loggingContent') || document.getElementById('logging-container');
}

function getLoggingSaveButton() {
  return document.getElementById('loggingSaveBtn') || document.getElementById('logging-save-btn');
}

function getLoggingSaveRow() {
  return document.getElementById('loggingSaveRow');
}

function setSaveStatus(message, ok = true) {
  const statusEl = document.getElementById('loggingSaveStatus');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = ok ? 'save-status success' : 'save-status error';
  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = 'save-status';
  }, 3000);
}

async function initLogging() {
  if (_loggingInitDone) return;
  const guildId = document.getElementById('pageData')?.dataset?.guildId;
  if (!guildId) return console.error("[Logging] No guild ID");
  
  await loadLoggingData(guildId);
  renderLogging(guildId);
  const saveBtn = getLoggingSaveButton();
  if (saveBtn) {
    saveBtn.addEventListener('click', () => saveLogging(guildId));
  }
  _loggingInitDone = true;
}

async function loadLoggingData(guildId) {
  const [channelsResp, loggingResp] = await Promise.all([
    fetch(`/api/guild/${guildId}/channels`, { headers: { "Content-Type": "application/json" } }).catch(() => null),
    fetch(`/api/guild/${guildId}/logging`, { headers: { "Content-Type": "application/json" } }).catch(() => null),
  ]);

  if (!loggingResp?.ok) {
    console.error("[Logging] Failed to load logging config");
    window.loggingConfig = {};
    return;
  }

  const cfg = await loggingResp.json();
  window.loggingConfig = cfg?.channels || {};

  if (channelsResp?.ok) {
    const channels = await channelsResp.json();
    _channelOptions = (channels || []).filter((c) => [0, 5, 15, 16].includes(c.type));
  } else {
    _channelOptions = [];
  }
}

function renderLogging(guildId) {
  const container = getLoggingContainer();
  if (!container) return;
  const bulkChannelOptions = renderChannelOptions('');
  const categoryHtml = LOG_CATEGORIES.map((cat) => {
    const categoryLabel = formatCategoryLabel(cat.label);
    const rows = cat.events.map((event) => renderEventRow(event)).join('');
    return `
      <details class="logging-category" open>
        <summary class="logging-category-header">
          <span class="logging-cat-arrow">▶</span>
          <span class="logging-cat-label">${escapeHtml(categoryLabel)}</span>
          <span class="logging-cat-count">${cat.events.length} events</span>
        </summary>
        <div class="logging-category-body">${rows}</div>
      </details>
    `;
  }).join('');

  container.innerHTML = `
    <div class="logging-toolbar">
      <div class="logging-toolbar-left">
        <button class="btn btn-sm" id="loggingBulkModeBtn" type="button">Select Events</button>
        <button class="btn btn-sm" id="loggingSelectAllBtn" type="button" style="display:none">Select All</button>
        <button class="btn btn-sm" id="loggingClearSelectedBtn" type="button" style="display:none">Clear</button>
        <span class="logging-bulk-count" id="loggingBulkCount">0 selected</span>
      </div>
      <div class="logging-toolbar-right">
        <label class="logging-bulk-channel-wrap" for="loggingBulkChannel">
          <span>Bulk Channel</span>
          <select class="logging-channel-select" id="loggingBulkChannel">${bulkChannelOptions}</select>
        </label>
        <button class="btn btn-sm btn-primary" id="loggingBulkApplyBtn" type="button" disabled>Apply to Selected</button>
        <button class="btn btn-sm" id="loggingToggleTestBtn" type="button">Test Buttons: On</button>
      </div>
    </div>
    <div class="logging-categories">${categoryHtml}</div>
  `;

  const bulkModeBtn = container.querySelector('#loggingBulkModeBtn');
  const selectAllBtn = container.querySelector('#loggingSelectAllBtn');
  const clearSelectedBtn = container.querySelector('#loggingClearSelectedBtn');
  const bulkApplyBtn = container.querySelector('#loggingBulkApplyBtn');
  const bulkChannelSelect = container.querySelector('#loggingBulkChannel');
  const toggleTestBtn = container.querySelector('#loggingToggleTestBtn');

  bulkModeBtn?.addEventListener('click', () => {
    _bulkSelectMode = !_bulkSelectMode;
    container.classList.toggle('bulk-select-enabled', _bulkSelectMode);
    bulkModeBtn.textContent = _bulkSelectMode ? 'Done Selecting' : 'Select Events';
    if (!_bulkSelectMode) {
      container.querySelectorAll('.logging-bulk-check').forEach((cb) => {
        cb.checked = false;
      });
    }
    updateBulkSelectionState(container);
  });

  selectAllBtn?.addEventListener('click', () => {
    container.querySelectorAll('.logging-bulk-check').forEach((cb) => {
      cb.checked = true;
    });
    updateBulkSelectionState(container);
  });

  clearSelectedBtn?.addEventListener('click', () => {
    container.querySelectorAll('.logging-bulk-check').forEach((cb) => {
      cb.checked = false;
    });
    updateBulkSelectionState(container);
  });

  bulkApplyBtn?.addEventListener('click', () => {
    if (!bulkChannelSelect) return;
    const selectedKeys = getSelectedEventKeys(container);
    if (!selectedKeys.length) return;

    const channelId = bulkChannelSelect.value || null;
    selectedKeys.forEach((key) => {
      window.loggingConfig[key] = channelId;
      const eventSelect = container.querySelector(`.logging-channel-select[data-event-key="${CSS.escape(key)}"]`);
      if (eventSelect) eventSelect.value = channelId || '';
    });

    updateBulkSelectionState(container);
  });

  toggleTestBtn?.addEventListener('click', () => {
    _testButtonsEnabled = !_testButtonsEnabled;
    updateTestButtonsState(container);
  });

  container.querySelectorAll('.logging-channel-select').forEach((selectEl) => {
    if (!selectEl.dataset.eventKey) return;
    selectEl.addEventListener('change', () => {
      const key = selectEl.dataset.eventKey;
      window.loggingConfig[key] = selectEl.value || null;
    });
  });

  container.querySelectorAll('.logging-bulk-check').forEach((checkEl) => {
    checkEl.addEventListener('change', () => updateBulkSelectionState(container));
  });

  container.querySelectorAll('.logging-test-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!_testButtonsEnabled) return;
      const key = btn.dataset.eventKey;
      const channelSelect = container.querySelector(`.logging-channel-select[data-event-key="${CSS.escape(key)}"]`);
      const selectedChannelId = channelSelect?.value || null;
      btn.disabled = true;
      const oldText = btn.textContent;
      btn.textContent = 'Testing...';
      try {
        const resp = await fetch(`/api/guild/${guildId}/logging/test`, {
          method: 'POST',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventKey: key, channelId: selectedChannelId }),
        });
        btn.textContent = resp.ok ? 'Sent' : 'Failed';
      } catch {
        btn.textContent = 'Failed';
      } finally {
        setTimeout(() => {
          btn.textContent = oldText;
          btn.disabled = false;
        }, 1200);
      }
    });
  });

  const saveRow = getLoggingSaveRow();
  if (saveRow) saveRow.style.display = 'flex';

  updateBulkSelectionState(container);
  updateTestButtonsState(container);
}

function formatCategoryLabel(rawLabel) {
  return String(rawLabel || '')
    .replace(/\s*\(\d+\s+events?\)\s*$/i, '')
    .trim();
}

function renderEventRow(event) {
  const selected = window.loggingConfig?.[event.key] || '';
  const options = renderChannelOptions(selected);

  return `
    <div class="logging-event-row">
      <label class="logging-bulk-check-wrap" title="Select for bulk assignment">
        <input type="checkbox" class="logging-bulk-check" data-event-key="${escapeHtml(event.key)}" />
      </label>
      <span class="logging-event-label" title="${escapeHtml(event.description || event.name)}">${escapeHtml(event.name)}</span>
      <div class="logging-row-actions">
        <select class="logging-channel-select" data-event-key="${escapeHtml(event.key)}">${options}</select>
        <button class="btn btn-sm logging-test-btn" data-event-key="${escapeHtml(event.key)}">Test</button>
      </div>
    </div>
  `;
}

function renderChannelOptions(selected) {
  return ['<option value="">Not logging</option>']
    .concat(_channelOptions.map((ch) => {
      const isSelected = ch.id === selected ? ' selected' : '';
      return `<option value="${escapeHtml(ch.id)}"${isSelected}>#${escapeHtml(ch.name || ch.id)}</option>`;
    }))
    .join('');
}

function getSelectedEventKeys(container) {
  return Array.from(container.querySelectorAll('.logging-bulk-check:checked'))
    .map((cb) => cb.dataset.eventKey)
    .filter(Boolean);
}

function updateBulkSelectionState(container) {
  const selectedKeys = getSelectedEventKeys(container);
  const countEl = container.querySelector('#loggingBulkCount');
  if (countEl) countEl.textContent = `${selectedKeys.length} selected`;

  const selectAllBtn = container.querySelector('#loggingSelectAllBtn');
  const clearSelectedBtn = container.querySelector('#loggingClearSelectedBtn');
  const bulkApplyBtn = container.querySelector('#loggingBulkApplyBtn');

  if (selectAllBtn) selectAllBtn.style.display = _bulkSelectMode ? '' : 'none';
  if (clearSelectedBtn) clearSelectedBtn.style.display = _bulkSelectMode ? '' : 'none';
  if (bulkApplyBtn) bulkApplyBtn.disabled = !_bulkSelectMode || selectedKeys.length === 0;
}

function updateTestButtonsState(container) {
  const toggleBtn = container.querySelector('#loggingToggleTestBtn');
  if (toggleBtn) {
    toggleBtn.textContent = `Test Buttons: ${_testButtonsEnabled ? 'On' : 'Off'}`;
  }
  container.classList.toggle('logging-tests-disabled', !_testButtonsEnabled);
  container.querySelectorAll('.logging-test-btn').forEach((btn) => {
    btn.disabled = !_testButtonsEnabled;
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function saveLogging(guildId) {
  const saveBtn = getLoggingSaveButton();
  if (saveBtn) saveBtn.disabled = true;

  const channels = Object.fromEntries(
    Object.entries(window.loggingConfig || {}).filter(([, v]) => v)
  );

  try {
    const resp = await fetch(`/api/guild/${guildId}/logging`, {
      method: 'PATCH',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channels }),
    });

    if (resp.ok) {
      setSaveStatus('✅ Saved logging configuration.', true);
    } else {
      setSaveStatus('❌ Failed to save logging configuration.', false);
    }
  } catch {
    setSaveStatus('❌ Failed to save logging configuration.', false);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
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
  saveLogging,
};

// Auto-init if DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLogging);
} else {
  initLogging().catch(console.error);
}

document.addEventListener('sectionActivated', (e) => {
  if (e.detail?.section === 'logging') {
    initLogging().catch(console.error);
  }
});

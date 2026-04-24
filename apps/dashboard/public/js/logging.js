/**
 * logging.js — Dashboard client for the Logging section.
 * Loaded on server.ejs. Initialises when the #section-logging becomes active.
 */

(function () {
  'use strict';

  // ── Event categories & keys ──────────────────────────────────
  const LOG_CATEGORIES = [
    {
      label: '🧩 Applications',
      events: [
        { key: 'app_add',                           label: 'App Add' },
        { key: 'app_remove',                        label: 'App Remove' },
        { key: 'app_command_permissions_update',    label: 'App Command Permissions Update' },
      ],
    },
    {
      label: '📁 Channels',
      events: [
        { key: 'channel_create',                               label: 'Channel Create' },
        { key: 'channel_delete',                               label: 'Channel Delete' },
        { key: 'channel_update',                               label: 'Channel Update' },
        { key: 'channel_pins_update',                          label: 'Channel Pins Update' },
        { key: 'channel_flags_update',                         label: 'Channel Flags Update' },
        { key: 'channel_name_update',                          label: 'Channel Name Update' },
        { key: 'channel_topic_update',                         label: 'Channel Topic Update' },
        { key: 'channel_nsfw_update',                          label: 'Channel NSFW Update' },
        { key: 'channel_rate_limit_update',                    label: 'Channel Rate Limit Update' },
        { key: 'channel_permission_update',                    label: 'Channel Permission Update' },
        { key: 'channel_type_update',                          label: 'Channel Type Update' },
        { key: 'channel_user_limit_update',                    label: 'Channel User Limit Update' },
        { key: 'channel_video_quality_update',                 label: 'Channel Video Quality Update' },
        { key: 'channel_rtc_region_update',                    label: 'Channel RTC Region Update' },
        { key: 'channel_bitrate_update',                       label: 'Channel Bitrate Update' },
        { key: 'channel_default_auto_archive_duration_update', label: 'Channel Default Auto Archive Duration Update' },
        { key: 'channel_default_thread_slowmode_update',       label: 'Channel Default Thread Slowmode Update' },
        { key: 'channel_default_reaction_emoji_update',        label: 'Channel Default Reaction Emoji Update' },
        { key: 'channel_default_sort_order_update',            label: 'Channel Default Sort Order Update' },
        { key: 'channel_forum_tag_update',                     label: 'Channel Forum Tag Update' },
        { key: 'channel_forum_layout_update',                  label: 'Channel Forum Layout Update' },
        { key: 'channel_voice_status_update',                  label: 'Channel Voice Status Update' },
      ],
    },
    {
      label: '🤖 Discord AutoMod',
      events: [
        { key: 'automod_rule_create',           label: 'Discord AutoMod Rule Create' },
        { key: 'automod_rule_delete',           label: 'Discord AutoMod Rule Delete' },
        { key: 'automod_rule_update',           label: 'Discord AutoMod Rule Update' },
        { key: 'automod_action',                label: 'Discord AutoMod Action Executed' },
        { key: 'automod_rule_enable_update',    label: 'Discord AutoMod Rule Enable Update' },
        { key: 'automod_rule_trigger_update',   label: 'Discord AutoMod Rule Trigger Update' },
        { key: 'automod_rule_content_update',   label: 'Discord AutoMod Rule Content Update' },
        { key: 'automod_rule_role_update',      label: 'Discord AutoMod Rule Role Update' },
        { key: 'automod_rule_channel_update',   label: 'Discord AutoMod Rule Channel Update' },
        { key: 'automod_rule_whitelist_update', label: 'Discord AutoMod Rule Whitelist Update' },
      ],
    },
    {
      label: '😀 Emojis',
      events: [
        { key: 'emoji_create',      label: 'Emoji Create' },
        { key: 'emoji_delete',      label: 'Emoji Delete' },
        { key: 'emoji_update',      label: 'Emoji Update' },
        { key: 'emoji_role_update', label: 'Emoji Role Update' },
      ],
    },
    {
      label: '🎟 Events',
      events: [
        { key: 'event_create',                 label: 'Event Create' },
        { key: 'event_delete',                 label: 'Event Delete' },
        { key: 'event_update',                 label: 'Event Update' },
        { key: 'event_name_update',            label: 'Event Name Update' },
        { key: 'event_description_update',     label: 'Event Description Update' },
        { key: 'event_channel_update',         label: 'Event Channel Update' },
        { key: 'event_privacy_level_update',   label: 'Event Privacy Level Update' },
        { key: 'event_status_update',          label: 'Event Status Update' },
        { key: 'event_start_time_update',      label: 'Event Start Time Update' },
        { key: 'event_end_time_update',        label: 'Event End Time Update' },
        { key: 'event_image_update',           label: 'Event Image Update' },
        { key: 'event_recurrence_rule_update', label: 'Event Recurrence Rule Update' },
        { key: 'event_location_update',        label: 'Event Location Update' },
        { key: 'event_user_add',               label: 'Event User Add' },
        { key: 'event_user_remove',            label: 'Event User Remove' },
      ],
    },
    {
      label: '🔗 Invites',
      events: [
        { key: 'invite_create', label: 'Invite Create' },
        { key: 'invite_delete', label: 'Invite Delete' },
        { key: 'invite_uses',   label: 'Invite Uses' },
      ],
    },
    {
      label: '💬 Messages',
      events: [
        { key: 'message_delete',               label: 'Message Delete' },
        { key: 'message_bulk_delete',          label: 'Message Bulk Delete' },
        { key: 'message_edit',                 label: 'Message Edit' },
        { key: 'message_pin',                  label: 'Message Pin' },
        { key: 'message_publish',              label: 'Message Publish' },
        { key: 'message_send_webhook_command', label: 'Message Send (Webhook Command)' },
      ],
    },
    {
      label: '🗳 Polls',
      events: [
        { key: 'poll_create',      label: 'Poll Create' },
        { key: 'poll_delete',      label: 'Poll Delete' },
        { key: 'poll_vote_add',    label: 'Poll Vote Add' },
        { key: 'poll_vote_remove', label: 'Poll Vote Remove' },
      ],
    },
    {
      label: '🎭 Roles',
      events: [
        { key: 'role_create',             label: 'Role Create' },
        { key: 'role_delete',             label: 'Role Delete' },
        { key: 'role_update',             label: 'Role Update' },
        { key: 'role_color_update',       label: 'Role Color Update' },
        { key: 'role_flags_update',       label: 'Role Flags Update' },
        { key: 'role_mentionable_update', label: 'Role Mentionable Update' },
        { key: 'role_name_update',        label: 'Role Name Update' },
        { key: 'role_permission_update',  label: 'Role Permission Update' },
        { key: 'role_icon_update',        label: 'Role Icon Update' },
      ],
    },
    {
      label: '🎤 Stages',
      events: [
        { key: 'stage_create',         label: 'Stage Create' },
        { key: 'stage_delete',         label: 'Stage Delete' },
        { key: 'stage_topic_update',   label: 'Stage Topic Update' },
        { key: 'stage_privacy_update', label: 'Stage Privacy Update' },
      ],
    },
    {
      label: '🛠 Server',
      events: [
        { key: 'ban_add',                               label: 'Ban Add' },
        { key: 'ban_remove',                            label: 'Ban Remove' },
        { key: 'user_join',                             label: 'User Join' },
        { key: 'user_leave',                            label: 'User Leave' },
        { key: 'member_update',                         label: 'Member Update' },
        { key: 'guild_update',                          label: 'Server Update' },
        { key: 'afk_channel_update',                    label: 'AFK Channel Update' },
        { key: 'afk_timeout_update',                    label: 'AFK Timeout Update' },
        { key: 'server_icon_update',                    label: 'Server Icon Update' },
        { key: 'message_notification_update',           label: 'Message Notification Update' },
        { key: 'server_discovery_splash_update',        label: 'Server Discovery Splash Update' },
        { key: 'server_discovery_feature_level_update', label: 'Server Discovery Feature Level Update' },
        { key: 'server_features_update',                label: 'Server Features Update' },
        { key: 'server_vanity_url_update',              label: 'Server Vanity URL Update' },
        { key: 'mfa_level_update',                      label: 'MFA Level Update' },
        { key: 'server_name_update',                    label: 'Server Name Update' },
        { key: 'server_description_update',             label: 'Server Description Update' },
        { key: 'server_owner_update',                   label: 'Server Owner Update' },
        { key: 'partnered_update',                      label: 'Partnered Update' },
        { key: 'server_banner_level_update',            label: 'Server Banner Level Update' },
        { key: 'boost_progress_bar_toggle',             label: 'Boost Progress Bar Toggle' },
        { key: 'public_updates_channel_update',         label: 'Public Updates Channel Update' },
        { key: 'server_rules_channel_update',           label: 'Server Rules Channel Update' },
        { key: 'server_widget_update',                  label: 'Server Widget Update' },
        { key: 'system_channel_update',                 label: 'System Channel Update' },
        { key: 'server_preferred_locale_update',        label: 'Server Preferred Locale Update' },
        { key: 'verification_level_update',             label: 'Verification Level Update' },
        { key: 'verified_update',                       label: 'Verified Update' },
        { key: 'server_welcome_update',                 label: 'Server Welcome Update' },
        { key: 'onboarding_toggle',                     label: 'Onboarding Toggle' },
        { key: 'onboarding_channel_update',             label: 'Onboarding Channel Update' },
        { key: 'onboarding_question_add',               label: 'Onboarding Question Add' },
        { key: 'onboarding_question_remove',            label: 'Onboarding Question Remove' },
        { key: 'onboarding_question_update',            label: 'Onboarding Question Update' },
      ],
    },
    {
      label: '📦 Stickers',
      events: [
        { key: 'sticker_create',             label: 'Sticker Create' },
        { key: 'sticker_delete',             label: 'Sticker Delete' },
        { key: 'sticker_update',             label: 'Sticker Update' },
        { key: 'sticker_name_update',        label: 'Sticker Name Update' },
        { key: 'sticker_description_update', label: 'Sticker Description Update' },
        { key: 'sticker_tags_update',        label: 'Sticker Tags Update' },
      ],
    },
    {
      label: '🔊 Soundboard',
      events: [
        { key: 'soundboard_sound_upload',        label: 'Soundboard Sound Upload' },
        { key: 'soundboard_sound_delete',        label: 'Soundboard Sound Delete' },
        { key: 'soundboard_sound_volume_update', label: 'Soundboard Sound Volume Update' },
        { key: 'soundboard_sound_emoji_update',  label: 'Soundboard Sound Emoji Update' },
        { key: 'soundboard_sound_name_update',   label: 'Soundboard Sound Name Update' },
      ],
    },
    {
      label: '🧵 Threads',
      events: [
        { key: 'thread_create',                  label: 'Thread Create' },
        { key: 'thread_delete',                  label: 'Thread Delete' },
        { key: 'thread_update',                  label: 'Thread Update' },
        { key: 'thread_name_update',             label: 'Thread Name Update' },
        { key: 'thread_slow_mode_update',        label: 'Thread Slow Mode Update' },
        { key: 'thread_archive_duration_update', label: 'Thread Archive Duration Update' },
        { key: 'thread_archive',                 label: 'Thread Archive' },
        { key: 'thread_unarchive',               label: 'Thread Unarchive' },
        { key: 'thread_lock',                    label: 'Thread Lock' },
        { key: 'thread_unlock',                  label: 'Thread Unlock' },
      ],
    },
    {
      label: '👤 Users',
      events: [
        { key: 'user_update',          label: 'User Update' },
        { key: 'user_role_update',     label: 'User Role Update' },
        { key: 'user_mute',            label: 'User Mute' },
        { key: 'user_ban',             label: 'User Ban' },
        { key: 'user_role_remove',     label: 'User Role Remove' },
        { key: 'user_unban',           label: 'User Unban' },
        { key: 'user_timed_out',       label: 'User Timed Out' },
        { key: 'user_timeout_removed', label: 'User Timeout Removed' },
      ],
    },
    {
      label: '🎙 Voice',
      events: [
        { key: 'voice_channel_pull', label: 'Voice Channel Pull' },
        { key: 'voice_user_join',    label: 'Voice User Join' },
        { key: 'voice_user_switch',  label: 'Voice User Switch' },
        { key: 'voice_user_leave',   label: 'Voice User Leave' },
        { key: 'voice_user_move',    label: 'Voice User Move' },
        { key: 'voice_user_mute',    label: 'Voice User Mute' },
        { key: 'voice_user_deafen',  label: 'Voice User Deafen' },
      ],
    },
    {
      label: '🔗 Webhooks',
      events: [
        { key: 'webhook_create',         label: 'Webhook Create' },
        { key: 'webhook_user_update',    label: 'Webhook User Update' },
        { key: 'webhook_message_create', label: 'Webhook Message Create' },
        { key: 'webhook_channel_update', label: 'Webhook Channel Update' },
        { key: 'webhook_delete',         label: 'Webhook Delete' },
      ],
    },
    {
      label: '🛡 Moderation',
      events: [
        { key: 'mod_auto_moderation',  label: 'Auto Moderation' },
        { key: 'mod_ban_add',          label: 'Ban Add' },
        { key: 'mod_ban_remove',       label: 'Ban Remove' },
        { key: 'mod_case_create',      label: 'Case Create' },
        { key: 'mod_mass_case_delete', label: 'Mass Case Delete' },
        { key: 'mod_case_update',      label: 'Case Update' },
        { key: 'mod_kick_add',         label: 'Kick Add' },
        { key: 'mod_kick_remove',      label: 'Kick Remove' },
        { key: 'mod_mute_add',         label: 'Mute Add' },
        { key: 'mod_mute_remove',      label: 'Mute Remove' },
        { key: 'mod_warn_add',         label: 'Warn Add' },
        { key: 'mod_warn_remove',      label: 'Warn Remove' },
        { key: 'mod_report_create',    label: 'Report Create' },
        { key: 'mod_report_update',    label: 'Report Update' },
        { key: 'mod_report_delete',    label: 'Report Delete' },
        { key: 'mod_user_warn_add',    label: 'User Warn Add' },
        { key: 'mod_user_warn_remove', label: 'User Warn Remove' },
      ],
    },
  ];

  // ── State ────────────────────────────────────────────────────
  let guildId = null;
  let channelOptions = []; // [{ id, name }]
  let loggingChannels = {}; // { eventKey: channelId | null }
  let initialized = false;

  // ── Init ─────────────────────────────────────────────────────
  function initLogging() {
    if (initialized) return;
    initialized = true;

    const pageData = document.getElementById('pageData');
    guildId = pageData ? pageData.dataset.guildId : null;
    if (!guildId) return;

    loadLoggingData();
  }

  async function loadLoggingData() {
    const [channelsRes, loggingRes] = await Promise.all([
      fetch(`/api/guild/${guildId}/channels`),
      fetch(`/api/guild/${guildId}/logging`),
    ]);

    if (!channelsRes.ok || !loggingRes.ok) {
      document.getElementById('loggingContent').innerHTML = '<p class="error-text">Failed to load logging data.</p>';
      return;
    }

    const channelsData = await channelsRes.json();
    const loggingData = await loggingRes.json();

    // Text-like channels: type 0 (text), 5 (announcement), 15 (forum), 16 (media)
    channelOptions = channelsData.filter((c) => [0, 5, 15, 16].includes(c.type));
    loggingChannels = loggingData.channels ?? {};

    renderLogging();
  }

  function renderLogging() {
    const container = document.getElementById('loggingContent');
    const saveRow = document.getElementById('loggingSaveRow');
    if (!container) return;

    const html = LOG_CATEGORIES.map((cat) => `
      <details class="logging-category" open>
        <summary class="logging-category-header">
          <span class="logging-cat-arrow">▶</span>
          <span class="logging-cat-label">${escHtml(cat.label)}</span>
          <span class="logging-cat-count">${cat.events.length} events</span>
        </summary>
        <div class="logging-category-body">
          ${cat.events.map((ev) => renderEventRow(ev)).join('')}
        </div>
      </details>
    `).join('');

    container.innerHTML = `<div class="logging-categories">${html}</div>`;
    if (saveRow) saveRow.style.display = 'flex';

    const saveBtn = document.getElementById('loggingSaveBtn');
    if (saveBtn) saveBtn.onclick = saveLogging;
  }

  function renderEventRow(ev) {
    const currentVal = loggingChannels[ev.key] ?? '';
    const opts = `<option value="">Not logging</option>` +
      channelOptions.map((c) =>
        `<option value="${escHtml(c.id)}" ${c.id === currentVal ? 'selected' : ''}>#${escHtml(c.name)}</option>`
      ).join('');
    return `
      <div class="logging-event-row">
        <span class="logging-event-label">${escHtml(ev.label)}</span>
        <select class="logging-channel-select" data-event-key="${escHtml(ev.key)}">
          ${opts}
        </select>
      </div>
    `;
  }

  async function saveLogging() {
    const selects = document.querySelectorAll('.logging-channel-select');
    const channels = {};
    selects.forEach((sel) => {
      channels[sel.dataset.eventKey] = sel.value || null;
    });

    const saveBtn = document.getElementById('loggingSaveBtn');
    const statusEl = document.getElementById('loggingSaveStatus');
    if (saveBtn) saveBtn.disabled = true;
    if (statusEl) statusEl.textContent = 'Saving…';

    try {
      const res = await fetch(`/api/guild/${guildId}/logging`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Request failed');
      loggingChannels = channels;
      if (statusEl) { statusEl.textContent = '✅ Saved!'; statusEl.className = 'save-status success'; }
    } catch (err) {
      if (statusEl) { statusEl.textContent = '❌ ' + err.message; statusEl.className = 'save-status error'; }
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    }
  }

  function escHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Hook into section navigation ─────────────────────────────
  document.addEventListener('sectionActivated', (e) => {
    if (e.detail?.section === 'logging') initLogging();
  });
})();

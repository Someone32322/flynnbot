/* ══════════════════════════════════════════════════════════════
   Message Builder — builder.js
   Discohook-inspired WYSIWYG editor + multi-mode delivery
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────
  let guildId      = null;
  let allMessages  = [];
  let editingId    = null;   // null = new
  let guildRoles   = [];
  let guildChannels = [];
  let assetsLoaded = false;
  let embedCount   = 0;      // monotonic counter for unique IDs
  let initialized  = false;

  const DELIVERY_TYPES = [
    { key: 'template',        icon: '🗂️',  label: 'Template',     desc: 'Save only. Send with /sendembed.' },
    { key: 'channel',         icon: '📤',  label: 'Channel',      desc: 'Send immediately to a channel.' },
    { key: 'webhook',         icon: '🔗',  label: 'Webhook',      desc: 'Post via Discord Webhook URL.' },
    { key: 'schedule_once',   icon: '🕐',  label: 'Schedule Once', desc: 'Send once at a date & time.' },
    { key: 'schedule_repeat', icon: '🔄',  label: 'Repeating',    desc: 'Send every N minutes.' },
    { key: 'sticky',          icon: '📌',  label: 'Sticky',       desc: 'Always last message in a channel.' },
    { key: 'command',         icon: '⚡',  label: 'Command Trigger', desc: 'Triggered by a keyword.' },
  ];

  // ── Event delegation handlers (CSP-safe: no inline onclick/oninput in HTML) ──
  function _onSectionClick(e) {
    const t = e.target;

    // Delivery type button
    const dtBtn = t.closest('.delivery-type-btn');
    if (dtBtn) { selectDeliveryType(dtBtn.dataset.dtype); return; }

    // Embed panel header toggle (but not child buttons)
    const embedHdr = t.closest('.embed-panel-header');
    if (embedHdr && !t.closest('button')) {
      embedHdr.closest('.embed-panel')?.classList.toggle('open');
      return;
    }

    // Remove embed
    const removeEmbedBtn = t.closest('[data-action="remove-embed"]');
    if (removeEmbedBtn) {
      e.stopPropagation();
      const eid = removeEmbedBtn.dataset.embedId;
      document.querySelector(`.embed-panel[data-embed-id="${eid}"]`)?.remove();
      const empty = document.getElementById('builderEmbedsEmpty');
      if (empty) empty.style.display = document.querySelectorAll('#builderEmbedsList .embed-panel').length ? 'none' : '';
      updatePreview();
      return;
    }

    // Embed sub-section header toggle
    const subHdr = t.closest('.embed-sub-header');
    if (subHdr) { subHdr.closest('.embed-sub')?.classList.toggle('open'); return; }

    // Add embed field
    const addFieldBtn = t.closest('[data-action="add-field"]');
    if (addFieldBtn) { addEmbedField(addFieldBtn.dataset.embedId); return; }

    // Remove embed field
    const removeFieldBtn = t.closest('[data-action="remove-field"]');
    if (removeFieldBtn) {
      e.stopPropagation();
      document.querySelector(`[data-field-id="${removeFieldBtn.dataset.fieldId}"]`)?.remove();
      updatePreview();
      return;
    }

    // Edit message card
    const editBtn = t.closest('[data-action="edit-msg"]');
    if (editBtn) { openEditor(editBtn.dataset.id); return; }

    // Delete message card
    const deleteBtn = t.closest('[data-action="delete-msg"]');
    if (deleteBtn) { deleteMessage(deleteBtn.dataset.id); return; }

    // Center empty-state "+ New Message"
    if (t.closest('#builderNewBtnEmpty')) { openEditor(null); return; }
  }

  function _onSectionInput(e) {
    const t = e.target;

    if ('livePreview' in t.dataset) { updatePreview(); return; }

    if ('colorPicker' in t.dataset) {
      const id = t.dataset.embedId;
      const hex = t.value;
      const hexInput = document.getElementById(`embedColorHex${id}`);
      if (hexInput) hexInput.value = hex;
      const bar = document.getElementById(`embedBar${id}`);
      if (bar) bar.style.background = hex;
      updatePreview();
      return;
    }

    if ('hexInput' in t.dataset) {
      const id = t.dataset.embedId;
      const raw = t.value;
      const hex = raw.startsWith('#') ? raw : '#' + raw;
      if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
        const picker = document.getElementById(`embedColor${id}`);
        if (picker) picker.value = hex;
        const bar = document.getElementById(`embedBar${id}`);
        if (bar) bar.style.background = hex;
      }
      updatePreview();
      return;
    }
  }

  function _onSectionChange(e) {
    if ('livePreview' in e.target.dataset) updatePreview();
  }

  // ── Boot ─────────────────────────────────────────────────────
  function initBuilder() {
    guildId = document.getElementById('pageData')?.dataset?.guildId;
    if (!guildId) return;
    if (initialized) { renderList(); return; }
    initialized = true;

    document.getElementById('builderNewBtn')?.addEventListener('click', () => openEditor(null));
    document.getElementById('builderNewBtnEmpty')?.addEventListener('click', () => openEditor(null));
    document.getElementById('builderEditorBack')?.addEventListener('click', closeEditor);
    document.getElementById('builderSaveBtn')?.addEventListener('click', () => saveMessage(false));
    document.getElementById('builderSendNowBtn')?.addEventListener('click', () => saveMessage(true));
    document.getElementById('builderAddEmbedBtn')?.addEventListener('click', () => addEmbed());

    // Name input live preview
    document.getElementById('builderEditorMsgName')?.addEventListener('input', updatePreview);

    // Collapse toggles for top-level section panels
    document.querySelectorAll('#section-embeds .bsec-header[data-collapsible]').forEach((h) => {
      h.addEventListener('click', () => h.closest('.bsec')?.classList.toggle('open'));
    });

    // Content char counter + live preview
    const cta = document.getElementById('builderContent');
    const ctc = document.getElementById('builderContentCount');
    if (cta && ctc) {
      cta.addEventListener('input', () => { ctc.textContent = cta.value.length; updatePreview(); });
    }

    // Section-level event delegation (replaces all inline onclick/oninput in dynamic HTML)
    const section = document.getElementById('section-embeds');
    if (section) {
      section.addEventListener('click', _onSectionClick);
      section.addEventListener('input', _onSectionInput);
      section.addEventListener('change', _onSectionChange);
    }

    loadMessages();
  }

  // ── Data ─────────────────────────────────────────────────────
  async function loadMessages() {
    try {
      const r = await fetch(`/api/guild/${guildId}/messages`);
      if (!r.ok) throw new Error(await r.text());
      allMessages = await r.json();
    } catch (e) {
      showToast('Failed to load messages: ' + e.message, 'error');
      allMessages = [];
    }
    renderList();
  }

  async function loadAssets() {
    if (assetsLoaded) return;
    try {
      const [channels, roles] = await Promise.all([
        fetch(`/api/guild/${guildId}/channels`).then((r) => r.json()),
        fetch(`/api/guild/${guildId}/roles`).then((r) => r.json()),
      ]);
      guildChannels = Array.isArray(channels) ? channels.filter((c) => c.type === 0) : [];
      guildRoles    = Array.isArray(roles)    ? roles.filter((r) => !r.managed) : [];
      assetsLoaded  = true;
    } catch (e) {
      console.warn('[Builder] Failed to load channels/roles', e);
    }
  }

  // ── List view ─────────────────────────────────────────────────
  function renderList() {
    const strip = document.getElementById('builderListStrip');
    if (!strip) return;

    if (!allMessages.length) {
      strip.innerHTML = '';
      return;
    }

    strip.innerHTML = allMessages.map((m) => {
      const dtype = m.delivery?.type || 'template';
      const badge = deliveryBadge(dtype);
      return `
        <div class="builder-msg-card${editingId === m._id ? ' active' : ''}" data-id="${m._id}">
          <div class="builder-msg-card-name">${esc(m.name)}</div>
          <span class="builder-msg-card-badge ${badge.cls}">${badge.icon} ${badge.label}</span>
          <div class="builder-msg-card-actions">
            <button class="btn btn-sm" data-action="edit-msg" data-id="${m._id}">Edit</button>
            <button class="btn btn-sm btn-danger" data-action="delete-msg" data-id="${m._id}">✕</button>
          </div>
        </div>`;
    }).join('');
  }

  function deliveryBadge(type) {
    const map = {
      template:        { cls: 'badge-template', icon: '🗂️', label: 'Template' },
      channel:         { cls: 'badge-channel',  icon: '📤', label: 'Channel' },
      webhook:         { cls: 'badge-webhook',  icon: '🔗', label: 'Webhook' },
      schedule_once:   { cls: 'badge-schedule', icon: '🕐', label: 'Once' },
      schedule_repeat: { cls: 'badge-schedule', icon: '🔄', label: 'Repeating' },
      sticky:          { cls: 'badge-sticky',   icon: '📌', label: 'Sticky' },
      command:         { cls: 'badge-command',  icon: '⚡', label: 'Command' },
    };
    return map[type] || { cls: 'badge-template', icon: '🗂️', label: type };
  }

  // ── Editor open/close ─────────────────────────────────────────
  async function openEditor(msgOrId) {
    await loadAssets();
    embedCount = 0;

    let msg = null;
    if (msgOrId && typeof msgOrId === 'string') {
      msg = allMessages.find((m) => m._id === msgOrId) || null;
    } else if (msgOrId && typeof msgOrId === 'object') {
      msg = msgOrId;
    }

    editingId = msg ? msg._id : null;
    renderList(); // update active state on cards

    const nameInput = document.getElementById('builderEditorMsgName');
    if (nameInput) nameInput.value = msg ? msg.name : '';

    // Content
    const contentTA = document.getElementById('builderContent');
    if (contentTA) {
      contentTA.value = msg?.content || '';
      updateCharCount('builderContent', 'builderContentCount', 2000);
    }

    // Embeds
    const embedsList = document.getElementById('builderEmbedsList');
    if (embedsList) {
      embedsList.innerHTML = '';
      const embeds = msg?.embeds || [];
      embeds.forEach((emb) => addEmbed(emb));
    }

    // Delivery
    populateDelivery(msg?.delivery || { type: 'template' });

    // Show editor, hide empty state / show split
    document.getElementById('builderEmptyState')?.style?.setProperty('display', 'none');
    const editor = document.getElementById('builderEditor');
    if (editor) editor.style.display = 'flex';

    updatePreview();
  }

  function closeEditor() {
    editingId = null;
    const editor = document.getElementById('builderEditor');
    if (editor) editor.style.display = 'none';

    if (!allMessages.length) {
      document.getElementById('builderEmptyState')?.style?.setProperty('display', 'flex');
    }
    renderList();
  }

  // ── Embed panels ──────────────────────────────────────────────
  function addEmbed(data) {
    const id = ++embedCount;
    const emb = data || {};
    const colorHex = colorIntToHex(emb.color !== undefined ? emb.color : 0x0f52ba);

    const panel = document.createElement('div');
    panel.className = 'embed-panel open';
    panel.dataset.embedId = id;
    panel.innerHTML = `
      <div class="embed-panel-header">
        <div class="embed-panel-bar" id="embedBar${id}" style="background:${colorHex}"></div>
        <span class="embed-panel-title">Embed #${id}</span>
        <button class="btn btn-sm btn-danger" style="margin-left:auto;margin-right:0.5rem;font-size:0.72rem;padding:2px 8px"
          data-action="remove-embed" data-embed-id="${id}">Remove</button>
        <span class="embed-panel-chevron">▾</span>
      </div>
      <div class="embed-panel-body">

        <!-- Body sub-section -->
        <div class="embed-sub open">
          <div class="embed-sub-header">
            <span class="embed-sub-title">Body</span>
            <span class="embed-sub-chevron">▾</span>
          </div>
          <div class="embed-sub-body">
            <div class="bf-color-row">
              <input type="color" id="embedColor${id}" value="${colorHex}"
                data-color-picker data-embed-id="${id}" style="cursor:pointer">
              <label class="bf-label" style="flex:1">
                Hex Color
                <input type="text" id="embedColorHex${id}" maxlength="7" value="${colorHex}"
                  placeholder="#0f52ba"
                  data-hex-input data-embed-id="${id}" style="font-family:monospace">
              </label>
            </div>
            <label class="bf-label">
              Title <small style="font-weight:400;opacity:.6">(max 256)</small>
              <input type="text" id="embedTitle${id}" maxlength="256"
                value="${esc(emb.title || '')}" data-live-preview placeholder="Embed title…">
            </label>
            <label class="bf-label">
              Title URL
              <input type="url" id="embedUrl${id}" value="${esc(emb.url || '')}"
                data-live-preview placeholder="https://…">
            </label>
            <label class="bf-label">
              Description <small style="font-weight:400;opacity:.6">(max 4096)</small>
              <textarea id="embedDesc${id}" rows="4" maxlength="4096"
                data-live-preview placeholder="Embed description…">${esc(emb.description || '')}</textarea>
            </label>
          </div>
        </div>

        <!-- Author sub-section -->
        <div class="embed-sub">
          <div class="embed-sub-header">
            <span class="embed-sub-title">Author</span>
            <span class="embed-sub-chevron">▾</span>
          </div>
          <div class="embed-sub-body">
            <label class="bf-label">Author Name
              <input type="text" id="embedAuthorName${id}" maxlength="256"
                value="${esc(emb.authorName || '')}" data-live-preview placeholder="Author name…">
            </label>
            <div class="bf-row">
              <label class="bf-label">Author Icon URL
                <input type="url" id="embedAuthorIcon${id}" value="${esc(emb.authorIcon || '')}"
                  data-live-preview placeholder="https://…">
              </label>
              <label class="bf-label">Author URL
                <input type="url" id="embedAuthorUrl${id}" value="${esc(emb.authorUrl || '')}"
                  data-live-preview placeholder="https://…">
              </label>
            </div>
          </div>
        </div>

        <!-- Images sub-section -->
        <div class="embed-sub">
          <div class="embed-sub-header">
            <span class="embed-sub-title">Images</span>
            <span class="embed-sub-chevron">▾</span>
          </div>
          <div class="embed-sub-body">
            <label class="bf-label">Image URL <small style="font-weight:400;opacity:.6">(large, below description)</small>
              <input type="url" id="embedImage${id}" value="${esc(emb.imageUrl || '')}"
                data-live-preview placeholder="https://…">
            </label>
            <label class="bf-label">Thumbnail URL <small style="font-weight:400;opacity:.6">(small, top-right)</small>
              <input type="url" id="embedThumb${id}" value="${esc(emb.thumbnail || '')}"
                data-live-preview placeholder="https://…">
            </label>
          </div>
        </div>

        <!-- Footer sub-section -->
        <div class="embed-sub">
          <div class="embed-sub-header">
            <span class="embed-sub-title">Footer</span>
            <span class="embed-sub-chevron">▾</span>
          </div>
          <div class="embed-sub-body">
            <label class="bf-label">Footer Text <small style="font-weight:400;opacity:.6">(max 2048)</small>
              <input type="text" id="embedFooterText${id}" maxlength="2048"
                value="${esc(emb.footerText || '')}" data-live-preview placeholder="Footer text…">
            </label>
            <label class="bf-label">Footer Icon URL
              <input type="url" id="embedFooterIcon${id}" value="${esc(emb.footerIcon || '')}"
                data-live-preview placeholder="https://…">
            </label>
            <label class="bf-toggle-row">
              <input type="checkbox" id="embedTimestamp${id}" ${emb.timestamp ? 'checked' : ''}
                data-live-preview>
              Include timestamp
            </label>
          </div>
        </div>

        <!-- Fields sub-section -->
        <div class="embed-sub">
          <div class="embed-sub-header">
            <span class="embed-sub-title">Fields <small style="font-weight:400;opacity:.6;text-transform:none">(max 25)</small></span>
            <span class="embed-sub-chevron">▾</span>
          </div>
          <div class="embed-sub-body">
            <div class="embed-fields-list" id="embedFieldsList${id}"></div>
            <button class="btn btn-sm" style="width:100%"
              data-action="add-field" data-embed-id="${id}">+ Add Field</button>
          </div>
        </div>

      </div>`;

    document.getElementById('builderEmbedsList').appendChild(panel);

    // Hide empty hint
    const empty = document.getElementById('builderEmbedsEmpty');
    if (empty) empty.style.display = 'none';

    // Hydrate fields
    if (emb.fields?.length) {
      emb.fields.forEach((f) => addEmbedField(id, f));
    }
  }

  window.toggleEmbedPanel = function (id) {
    document.querySelector(`[data-embed-id="${id}"]`)?.classList.toggle('open');
  };

  window.removeEmbed = function (evt, id) {
    evt.stopPropagation();
    document.querySelector(`[data-embed-id="${id}"]`)?.remove();
    const empty = document.getElementById('builderEmbedsEmpty');
    if (empty) empty.style.display = document.querySelectorAll('#builderEmbedsList .embed-panel').length ? 'none' : '';
    updatePreview();
  };

  window.embedColorChanged = function (id) {
    const hex = document.getElementById(`embedColor${id}`)?.value || '#0f52ba';
    const hexInput = document.getElementById(`embedColorHex${id}`);
    if (hexInput) hexInput.value = hex;
    const bar = document.getElementById(`embedBar${id}`);
    if (bar) bar.style.background = hex;
    updatePreview();
  };

  window.embedHexChanged = function (id) {
    const raw = document.getElementById(`embedColorHex${id}`)?.value || '';
    const hex = raw.startsWith('#') ? raw : '#' + raw;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      const picker = document.getElementById(`embedColor${id}`);
      if (picker) picker.value = hex;
      const bar = document.getElementById(`embedBar${id}`);
      if (bar) bar.style.background = hex;
    }
    updatePreview();
  };

  function addEmbedField(embedId, fieldData) {
    const list = document.getElementById(`embedFieldsList${embedId}`);
    if (!list) return;
    if (list.children.length >= 25) {
      showToast('Max 25 fields per embed', 'error');
      return;
    }
    const fid = Date.now() + Math.random();
    const f = fieldData || {};
    const row = document.createElement('div');
    row.className = 'embed-field-row';
    row.dataset.fieldId = fid;
    row.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;gap:0.4rem">
        <div class="bf-row">
          <label class="bf-label">Name
            <input type="text" class="ef-name" maxlength="256"
              value="${esc(f.name || '')}" data-live-preview placeholder="Field name">
          </label>
          <div class="embed-field-inline-wrap">
            <input type="checkbox" class="ef-inline" ${f.inline ? 'checked' : ''} data-live-preview>
            Inline
          </div>
        </div>
        <label class="bf-label">Value
          <textarea class="ef-value" rows="2" maxlength="1024"
            data-live-preview placeholder="Field value…">${esc(f.value || '')}</textarea>
        </label>
      </div>
      <button class="btn btn-sm btn-danger" style="margin-top:1.4rem;flex-shrink:0"
        data-action="remove-field" data-field-id="${fid}">✕</button>`;
    list.appendChild(row);
    updatePreview();
  }

  // ── Delivery section ──────────────────────────────────────────
  function populateDelivery(delivery) {
    const typeGrid = document.getElementById('deliveryTypeGrid');
    if (!typeGrid) return;

    typeGrid.innerHTML = DELIVERY_TYPES.map((dt) => `
      <button type="button" class="delivery-type-btn${delivery.type === dt.key ? ' active' : ''}"
        data-dtype="${dt.key}">
        <span class="delivery-type-icon">${dt.icon}</span>
        ${dt.label}
      </button>`).join('');

    renderDeliveryConfig(delivery);
  }

  function selectDeliveryType(type) {
    document.querySelectorAll('.delivery-type-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.dtype === type);
    });
    const current = collectDelivery();
    current.type = type;
    renderDeliveryConfig(current);
  }

  function renderDeliveryConfig(delivery) {
    const wrap = document.getElementById('deliveryConfig');
    if (!wrap) return;

    const channelOpts = guildChannels.map((c) =>
      `<option value="${c.id}" ${delivery.channelId === c.id ? 'selected' : ''}>#${esc(c.name)}</option>`
    ).join('');
    const roleOpts = guildRoles.map((r) =>
      `<option value="${r.id}" ${delivery.commandRequiredRoleId === r.id ? 'selected' : ''}>${esc(r.name)}</option>`
    ).join('');

    const type = delivery.type || 'template';
    let html = '';

    if (type === 'template') {
      html = `<p class="bf-hint">💡 This message is saved as a template. Use <code>/sendembed &lt;name&gt;</code> in Discord to send it.</p>`;
    } else if (type === 'channel') {
      html = `
        <label class="bf-label">Target Channel
          <select id="dcChannelId">
            <option value="">— Select channel —</option>${channelOpts}
          </select>
        </label>
        <p class="bf-hint">Click <strong>Send Now</strong> to post to this channel immediately.</p>`;
    } else if (type === 'webhook') {
      html = `
        <label class="bf-label">Webhook URL
          <input type="url" id="dcWebhookUrl" value="${esc(delivery.webhookUrl || '')}"
            placeholder="https://discord.com/api/webhooks/…">
        </label>
        <p class="bf-hint">💡 Create a webhook in Discord channel settings → Integrations → Webhooks.</p>`;
    } else if (type === 'schedule_once') {
      const schedVal = delivery.scheduleAt ? fmtDatetimeLocal(new Date(delivery.scheduleAt)) : '';
      html = `
        <label class="bf-label">Target Channel
          <select id="dcChannelId">
            <option value="">— Select channel —</option>${channelOpts}
          </select>
        </label>
        <label class="bf-label">Send At (UTC)
          <input type="datetime-local" id="dcScheduleAt" value="${schedVal}">
        </label>
        <p class="bf-hint">Message will be sent once at the scheduled time and then disabled.</p>`;
    } else if (type === 'schedule_repeat') {
      const ims = delivery.intervalMins || '';
      html = `
        <label class="bf-label">Target Channel
          <select id="dcChannelId">
            <option value="">— Select channel —</option>${channelOpts}
          </select>
        </label>
        <label class="bf-label">Interval (minutes)
          <input type="number" id="dcIntervalMins" min="5" max="525600" value="${ims}"
            placeholder="e.g. 60 for every hour">
        </label>
        <p class="bf-hint">Message repeats every <strong>${ims || 'N'}</strong> minute(s). Minimum: 5 minutes.</p>`;
    } else if (type === 'sticky') {
      html = `
        <label class="bf-label">Sticky Channel
          <select id="dcChannelId">
            <option value="">— Select channel —</option>${channelOpts}
          </select>
        </label>
        <p class="bf-hint">📌 Every time someone sends a message in this channel, the bot will delete the old sticky and repost it so it stays at the bottom.</p>`;
    } else if (type === 'command') {
      const trig = delivery.commandTrigger || '';
      html = `
        <label class="bf-label">Trigger Word / Phrase
          <input type="text" id="dcCommandTrigger" maxlength="100" value="${esc(trig)}"
            placeholder="e.g. !rules or /info">
        </label>
        <label class="bf-label">Required Role <small style="font-weight:400;opacity:.6">(optional)</small>
          <select id="dcCommandRole">
            <option value="">— Anyone —</option>${roleOpts}
          </select>
        </label>
        <label class="bf-label">Reply Channel <small style="font-weight:400;opacity:.6">(leave blank = same channel)</small>
          <select id="dcChannelId">
            <option value="">— Same channel —</option>${channelOpts}
          </select>
        </label>
        <p class="bf-hint">⚡ When a user sends a message that starts with the trigger (and optionally has the required role), the bot replies with this message. Variables like <code>{user}</code> are substituted.</p>`;
    }

    wrap.innerHTML = html;
  }

  function collectDelivery() {
    const activeBtn = document.querySelector('.delivery-type-btn.active');
    const type = activeBtn?.dataset.dtype || 'template';

    const get = (id) => document.getElementById(id);
    const val = (id) => get(id)?.value?.trim() || null;

    const d = { type };

    if (['channel', 'schedule_once', 'schedule_repeat', 'sticky', 'command'].includes(type)) {
      d.channelId = val('dcChannelId');
    }
    if (type === 'webhook')   d.webhookUrl   = val('dcWebhookUrl');
    if (type === 'schedule_once')   d.scheduleAt  = val('dcScheduleAt')   ? new Date(val('dcScheduleAt')).toISOString() : null;
    if (type === 'schedule_repeat') d.intervalMins = get('dcIntervalMins')?.value ? Number(get('dcIntervalMins').value) : null;
    if (type === 'command') {
      d.commandTrigger        = val('dcCommandTrigger');
      d.commandRequiredRoleId = val('dcCommandRole');
    }
    return d;
  }

  // ── Preview renderer ──────────────────────────────────────────
  window.updatePreview = function () {
    const previewContent = document.getElementById('previewContent');
    const previewEmbeds  = document.getElementById('previewEmbeds');
    if (!previewContent || !previewEmbeds) return;

    // Set timestamp
    const ts = document.getElementById('previewTimestamp');
    if (ts) ts.textContent = 'Today at ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const content = document.getElementById('builderContent')?.value || '';
    previewContent.innerHTML = content ? `<div class="discord-content">${esc(content)}</div>` : '';

    const embedPanels = document.querySelectorAll('#builderEmbedsList .embed-panel');
    const embedsHtml  = Array.from(embedPanels).map((panel) => renderEmbedPreview(panel)).join('');
    previewEmbeds.innerHTML = embedsHtml || '';

    if (!content && !embedsHtml) {
      previewContent.innerHTML = '<div class="dp-empty">Nothing to preview yet…</div>';
    }
  };

  function renderEmbedPreview(panel) {
    const id = panel.dataset.embedId;
    if (!id) return '';

    const g = (sfx) => document.getElementById(`embed${sfx}${id}`)?.value?.trim() || '';
    const checked = (sfx) => document.getElementById(`embed${sfx}${id}`)?.checked || false;

    const colorHex  = document.getElementById(`embedColor${id}`)?.value || '#0f52ba';
    const title     = g('Title');
    const url       = g('Url');
    const desc      = g('Desc');
    const authorName = g('AuthorName');
    const authorIcon = g('AuthorIcon');
    const footerText = g('FooterText');
    const footerIcon = g('FooterIcon');
    const imageUrl   = g('Image');
    const thumbUrl   = g('Thumb');
    const timestamp  = checked('Timestamp');

    // Fields
    const fieldRows = panel.querySelectorAll('.embed-field-row');
    const fields = Array.from(fieldRows).map((row) => ({
      name:   row.querySelector('.ef-name')?.value?.trim() || '',
      value:  row.querySelector('.ef-value')?.value?.trim() || '',
      inline: row.querySelector('.ef-inline')?.checked || false,
    })).filter((f) => f.name && f.value);

    const hasContent = title || desc || authorName || footerText || fields.length;
    if (!hasContent && !imageUrl && !thumbUrl) return '';

    const safeImg = (src) => {
      if (!src) return null;
      try { new URL(src); return src; } catch { return null; }
    };

    let html = `<div class="dp-embed" style="border-left-color:${colorHex}">`;
    html += `<div class="dp-embed-body">`;

    if (authorName) {
      html += `<div class="dp-embed-author">`;
      const ai = safeImg(authorIcon);
      if (ai) html += `<img src="${esc(ai)}" alt="">`;
      html += `${esc(authorName)}</div>`;
    }

    if (title) {
      const tu = url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(title)}</a>` : esc(title);
      html += `<div class="dp-embed-title">${tu}</div>`;
    }

    if (desc) html += `<div class="dp-embed-desc">${esc(desc)}</div>`;

    if (fields.length) {
      html += `<div class="dp-embed-fields">`;
      fields.forEach((f) => {
        html += `<div class="dp-embed-field${f.inline ? ' inline' : ''}">
          <div class="dp-embed-field-name">${esc(f.name)}</div>
          <div class="dp-embed-field-value">${esc(f.value)}</div>
        </div>`;
      });
      html += `</div>`;
    }

    const imgSrc = safeImg(imageUrl);
    if (imgSrc) html += `<div class="dp-embed-image"><img src="${esc(imgSrc)}" alt=""></div>`;

    if (footerText || timestamp) {
      html += `<div class="dp-embed-footer">`;
      const fi = safeImg(footerIcon);
      if (fi) html += `<img src="${esc(fi)}" alt="">`;
      if (footerText) html += esc(footerText);
      if (footerText && timestamp) html += `<span class="dp-embed-footer-sep">•</span>`;
      if (timestamp) html += `<span>${fmtTimestamp()}</span>`;
      html += `</div>`;
    }

    html += `</div>`; // dp-embed-body

    // Thumbnail
    const thumbSrc = safeImg(thumbUrl);
    if (thumbSrc) {
      html += `<div class="dp-embed-thumbnail"><img src="${esc(thumbSrc)}" alt=""></div>`;
    }

    html += `</div>`; // dp-embed
    return html;
  }

  // ── Collect / save ────────────────────────────────────────────
  function collectMessage() {
    const name = document.getElementById('builderEditorMsgName')?.value?.trim();
    if (!name) return null;

    const content = document.getElementById('builderContent')?.value?.trim() || null;

    const embedPanels = document.querySelectorAll('#builderEmbedsList .embed-panel');
    const embeds = Array.from(embedPanels).map((panel) => {
      const id = panel.dataset.embedId;
      const g = (sfx) => document.getElementById(`embed${sfx}${id}`)?.value?.trim() || null;
      const checked = (sfx) => document.getElementById(`embed${sfx}${id}`)?.checked || false;

      const colorHex = document.getElementById(`embedColor${id}`)?.value || '#0f52ba';

      const fieldRows = panel.querySelectorAll('.embed-field-row');
      const fields = Array.from(fieldRows).map((row) => ({
        name:   row.querySelector('.ef-name')?.value?.trim() || '',
        value:  row.querySelector('.ef-value')?.value?.trim() || '',
        inline: row.querySelector('.ef-inline')?.checked || false,
      })).filter((f) => f.name && f.value);

      return {
        title:       g('Title'),
        description: g('Desc'),
        url:         g('Url'),
        color:       hexColorToInt(colorHex),
        authorName:  g('AuthorName'),
        authorIcon:  g('AuthorIcon'),
        authorUrl:   g('AuthorUrl'),
        footerText:  g('FooterText'),
        footerIcon:  g('FooterIcon'),
        imageUrl:    g('Image'),
        thumbnail:   g('Thumb'),
        timestamp:   checked('Timestamp'),
        fields,
      };
    });

    return {
      name,
      content,
      embeds,
      delivery: collectDelivery(),
    };
  }

  async function saveMessage(sendNow) {
    const data = collectMessage();
    if (!data) {
      showToast('Please enter a message name', 'error');
      return;
    }
    if (!data.content && !data.embeds.length) {
      showToast('Add some content or at least one embed', 'error');
      return;
    }

    // Validate delivery fields
    const d = data.delivery;
    if (d.type === 'webhook' && !d.webhookUrl) {
      showToast('Please enter a webhook URL', 'error');
      return;
    }
    if (['channel', 'schedule_once', 'schedule_repeat', 'sticky'].includes(d.type) && !d.channelId) {
      showToast('Please select a channel', 'error');
      return;
    }
    if (d.type === 'schedule_once' && !d.scheduleAt) {
      showToast('Please pick a schedule date/time', 'error');
      return;
    }
    if (d.type === 'schedule_repeat' && (!d.intervalMins || d.intervalMins < 5)) {
      showToast('Interval must be at least 5 minutes', 'error');
      return;
    }
    if (d.type === 'command' && !d.commandTrigger) {
      showToast('Please enter a command trigger word', 'error');
      return;
    }

    const method = editingId ? 'PUT' : 'POST';
    const url    = editingId
      ? `/api/guild/${guildId}/messages/${editingId}`
      : `/api/guild/${guildId}/messages`;

    const saveBtn = document.getElementById('builderSaveBtn');
    const sendBtn = document.getElementById('builderSendNowBtn');
    if (saveBtn) saveBtn.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    try {
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await r.json();
      if (!r.ok) {
        showToast(result.error || 'Save failed', 'error');
        return;
      }

      // Upsert local cache
      if (editingId) {
        const idx = allMessages.findIndex((m) => m._id === editingId);
        if (idx !== -1) allMessages[idx] = result;
      } else {
        allMessages.unshift(result);
        editingId = result._id;
      }

      showToast('Message saved!', 'success');
      renderList();

      if (sendNow) {
        await sendMessage(result._id);
      }
    } catch (e) {
      showToast('Save failed: ' + e.message, 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  async function sendMessage(id) {
    try {
      const r = await fetch(`/api/guild/${guildId}/messages/${id}/send`, { method: 'POST' });
      const result = await r.json();
      if (!r.ok) {
        showToast(result.error || 'Send failed', 'error');
      } else {
        showToast('Message sent! ✅', 'success');
      }
    } catch (e) {
      showToast('Send failed: ' + e.message, 'error');
    }
  }

  async function deleteMessage(id) {
    if (!confirm('Delete this message? This cannot be undone.')) return;
    try {
      const r = await fetch(`/api/guild/${guildId}/messages/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const result = await r.json().catch(() => ({}));
        showToast(result.error || 'Delete failed', 'error');
        return;
      }
      allMessages = allMessages.filter((m) => m._id !== id);
      if (editingId === id) closeEditor();
      renderList();
      showToast('Deleted.', 'success');
    } catch (e) {
      showToast('Delete failed: ' + e.message, 'error');
    }
  }

  // ── Helpers ───────────────────────────────────────────────────
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function colorIntToHex(n) {
    if (typeof n !== 'number') return '#0f52ba';
    return '#' + n.toString(16).padStart(6, '0');
  }

  function hexColorToInt(hex) {
    if (!hex) return 0x0f52ba;
    const clean = hex.replace('#', '');
    const n = parseInt(clean, 16);
    return isNaN(n) ? 0x0f52ba : n;
  }

  function updateCharCount(textareaId, counterId, max) {
    const ta  = document.getElementById(textareaId);
    const ctr = document.getElementById(counterId);
    if (!ta || !ctr) return;
    const update = () => { ctr.textContent = ta.value.length; };
    ta.addEventListener('input', update);
    update();
  }

  function fmtDatetimeLocal(d) {
    if (!d || isNaN(d)) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtTimestamp() {
    const now = new Date();
    return now.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // ── Toast ─────────────────────────────────────────────────────
  function showToast(msg, type = 'info') {
    if (typeof window.showToast === 'function' && window.showToast !== showToast) {
      window.showToast(msg, type);
      return;
    }
    const toast = document.createElement('div');
    toast.style.cssText = `
      position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;
      padding:0.75rem 1.25rem;border-radius:9px;font-size:0.875rem;font-weight:600;
      color:#fff;max-width:380px;word-break:break-word;
      box-shadow:0 4px 20px rgba(0,0,0,0.4);
      background:${type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#5865f2'};
      animation:fadeIn .2s ease`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  // ── Wire up on section activation ────────────────────────────
  // server.js dispatches CustomEvent 'sectionActivated' with detail.section
  document.addEventListener('sectionActivated', (e) => {
    if (e.detail?.section === 'embeds') initBuilder();
  });

  // Scripts are at bottom of <body> so DOM is already ready — no DOMContentLoaded needed.
  // If the page was loaded with #embeds hash, the section is already visible; init now.
  if (document.getElementById('section-embeds')?.style.display !== 'none') {
    initBuilder();
  }

})();

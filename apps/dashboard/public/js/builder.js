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
  let arRowCount   = 0;      // monotonic counter for action row IDs
  let arCompCount  = 0;      // monotonic counter for component IDs
  let initialized  = false;

  const DELIVERY_TYPES = [
    { key: 'template',        icon: '🗂️',  label: 'Template',     desc: 'Save only. Send with /sendembed.' },
    { key: 'channel',         icon: '📤',  label: 'Channel',      desc: 'Send immediately to a channel.' },
    { key: 'webhook',         icon: '🔗',  label: 'Webhook',      desc: 'Post via Discord Webhook URL.' },
    { key: 'schedule_once',   icon: '🕐',  label: 'Schedule Once', desc: 'Send once at a date & time.' },
    { key: 'schedule_repeat', icon: '🔄',  label: 'Repeating',    desc: 'Send every N minutes.' },
    { key: 'sticky',          icon: '📌',  label: 'Sticky',       desc: 'Always last message in a channel.' },
    { key: 'command',         icon: '⚡',  label: 'Command Trigger', desc: 'Triggered by a keyword.' },
    { key: 'ephemeral',       icon: '👁️',  label: 'Ephemeral',     desc: 'Respond with hidden message.' },
    { key: 'dm',              icon: '💬',  label: 'Direct Message', desc: 'Send as DM to user.' },
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

    // Action row: toggle component open/close
    const arCompHdr = t.closest('.ar-comp-header');
    if (arCompHdr && !t.closest('button') && !t.closest('select')) {
      arCompHdr.closest('.ar-comp')?.classList.toggle('open');
      return;
    }

    // Action row: add row
    if (t.closest('#builderAddRowBtn')) { addActionRow(); return; }

    // Action row: remove row
    const removeRowBtn = t.closest('[data-action="remove-ar-row"]');
    if (removeRowBtn) {
      e.stopPropagation();
      const rid = removeRowBtn.dataset.rowId;
      document.querySelector(`.ar-row[data-row-id="${rid}"]`)?.remove();
      syncAREmpty();
      updatePreview();
      return;
    }

    // Action row: add button to a button row
    const addBtnBtn = t.closest('[data-action="add-ar-button"]');
    if (addBtnBtn) { addARComponent(addBtnBtn.dataset.rowId, null, 'button'); return; }

    // Action row: add option to a select/emoji row
    const addOptBtn = t.closest('[data-action="add-ar-option"]');
    if (addOptBtn) { addARComponent(addOptBtn.dataset.rowId, null, 'option'); return; }

    // Action row: remove a component/option
    const removeCompBtn = t.closest('[data-action="remove-ar-comp"]');
    if (removeCompBtn) {
      e.stopPropagation();
      document.querySelector(`.ar-comp[data-comp-id="${removeCompBtn.dataset.compId}"]`)?.remove();
      updatePreview();
      return;
    }

    // Action row: style button click
    const styleBtn = t.closest('.ar-style-btn');
    if (styleBtn) {
      const compEl = styleBtn.closest('.ar-comp');
      if (compEl) {
        compEl.querySelectorAll('.ar-style-btn').forEach((b) => b.classList.remove('selected'));
        styleBtn.classList.add('selected');
        // Store style in hidden input
        const styleInput = compEl.querySelector('.ar-comp-style');
        if (styleInput) styleInput.value = styleBtn.dataset.style;
        // Show/hide URL field
        const urlRow = compEl.querySelector('.ar-comp-url-row');
        if (urlRow) urlRow.style.display = styleBtn.dataset.style === 'link' ? '' : 'none';
        // Show/hide action section
        const actionSec = compEl.querySelector('.ar-action-section');
        if (actionSec) actionSec.style.display = styleBtn.dataset.style === 'link' ? 'none' : '';
        updatePreview();
      }
      return;
    }

    // Attach to message button
    if (t.closest('#builderAttachMsgBtn')) { openAttachModal(); return; }

    // Attach modal close/cancel
    if (t.closest('#attachMsgClose') || t.closest('#attachMsgCancel')) { closeAttachModal(); return; }

    // Attach modal confirm
    if (t.closest('#attachMsgConfirm')) { doAttach(); return; }
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
    const t = e.target;
    if ('livePreview' in t.dataset) { updatePreview(); return; }

    // Action row type changed
    if (t.classList.contains('ar-row-type-select')) {
      const rowEl = t.closest('.ar-row');
      if (rowEl) updateARRowVisibility(rowEl, t.value);
      updatePreview();
      return;
    }

    // Action select changed inside a component
    if (t.classList.contains('ar-comp-action')) {
      applyARActionVisibility(t.closest('.ar-comp'));
      updatePreview();
      return;
    }

    // Content type changed
    if (t.classList.contains('ar-comp-content-type')) {
      applyARActionVisibility(t.closest('.ar-comp'));
      updatePreview();
      return;
    }
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

    // Attach modal backdrop click
    document.getElementById('attachMsgBackdrop')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeAttachModal();
    });

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
      ephemeral:       { cls: 'badge-ephemeral', icon: '👁️', label: 'Ephemeral' },
      dm:              { cls: 'badge-dm',       icon: '💬', label: 'DM' },
    };
    return map[type] || { cls: 'badge-template', icon: '🗂️', label: type };
  }

  // ── Editor open/close ─────────────────────────────────────────
  async function openEditor(msgOrId) {
    await loadAssets();
    embedCount  = 0;
    arRowCount  = 0;
    arCompCount = 0;

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

    // Action Rows
    const arList = document.getElementById('builderActionRowsList');
    if (arList) {
      arList.innerHTML = '';
      const actionRows = msg?.actionRows || [];
      actionRows.forEach((row) => addActionRow(row));
      syncAREmpty();
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

  // ── Action Row helpers ────────────────────────────────────────

  function syncAREmpty() {
    const list  = document.getElementById('builderActionRowsList');
    const empty = document.getElementById('builderActionRowsEmpty');
    if (!list || !empty) return;
    empty.style.display = list.children.length ? 'none' : '';
  }

  /**
   * Build the HTML for one action row.
   * data — saved row object (optional, for hydrating from existing message)
   */
  function addActionRow(data) {
    const list = document.getElementById('builderActionRowsList');
    if (!list) return;
    if (list.children.length >= 5) { showToast('Maximum 5 action rows per message', 'error'); return; }

    const rowNum  = ++arRowCount;
    const rowType = data?.rowType || 'button';
    const rowId   = data?.rowId || `ar${rowNum}`;

    const rowEl = document.createElement('div');
    rowEl.className = 'ar-row';
    rowEl.dataset.rowId = rowId;

    rowEl.innerHTML = `
      <div class="ar-row-header">
        <span class="ar-row-label">Row ${rowNum}</span>
        <select class="ar-row-type-select" data-row-id="${rowId}">
          <option value="button"  ${rowType === 'button'  ? 'selected' : ''}>🔘 Button Row</option>
          <option value="select"  ${rowType === 'select'  ? 'selected' : ''}>📋 Select Menu</option>
          <option value="emoji"   ${rowType === 'emoji'   ? 'selected' : ''}>😀 Emoji Reactions</option>
        </select>
        <button class="btn btn-sm btn-danger" data-action="remove-ar-row" data-row-id="${rowId}" title="Remove row">✕</button>
      </div>
      <div class="ar-row-body">

        <!-- Button Row body -->
        <div class="ar-type-body ar-type-button" style="${rowType !== 'button' ? 'display:none' : ''}">
          <div class="ar-components-list" id="arCompList_${rowId}"></div>
          <button class="btn btn-sm" data-action="add-ar-button" data-row-id="${rowId}"
            style="width:100%;margin-top:0.3rem">+ Add Button</button>
          <p class="bf-hint" style="background:none;border:none;padding:0;font-size:0.75rem">Up to 5 buttons per row. Link buttons open a URL and don't trigger interactions.</p>
        </div>

        <!-- Select Menu body -->
        <div class="ar-type-body ar-type-select" style="${rowType !== 'select' ? 'display:none' : ''}">
          <label class="bf-label">Placeholder Text
            <input type="text" class="ar-sel-placeholder" maxlength="150" data-live-preview
              placeholder="Select an option…" value="${esc(data?.placeholder || '')}">
          </label>
          <div class="ar-components-list" id="arOptList_${rowId}"></div>
          <button class="btn btn-sm" data-action="add-ar-option" data-row-id="${rowId}"
            style="width:100%;margin-top:0.3rem">+ Add Option</button>
          <p class="bf-hint" style="background:none;border:none;padding:0;font-size:0.75rem">Up to 25 options per select menu.</p>
        </div>

        <!-- Emoji Reactions body -->
        <div class="ar-type-body ar-type-emoji" style="${rowType !== 'emoji' ? 'display:none' : ''}">
          <div class="ar-components-list" id="arEmojiList_${rowId}"></div>
          <button class="btn btn-sm" data-action="add-ar-option" data-row-id="${rowId}"
            style="width:100%;margin-top:0.3rem">+ Add Emoji</button>
          <p class="bf-hint" style="background:none;border:none;padding:0;font-size:0.75rem">The bot will add these emoji reactions. Use the <strong>🔗 Attach</strong> button to bind them to an existing message.</p>
        </div>

      </div>`;

    // Wire up change on row type select (CSP-safe via delegation — but also direct for immediate update)
    rowEl.querySelector('.ar-row-type-select').addEventListener('change', function () {
      updateARRowVisibility(rowEl, this.value);
      updatePreview();
    });

    list.appendChild(rowEl);

    // Hydrate existing components
    if (Array.isArray(data?.options)) {
      data.options.forEach((opt) => addARComponent(rowId, opt, rowType === 'button' ? 'button' : 'option'));
    }

    syncAREmpty();
    updatePreview();
  }

  function updateARRowVisibility(rowEl, rowType) {
    rowEl.querySelectorAll('.ar-type-body').forEach((b) => { b.style.display = 'none'; });
    const active = rowEl.querySelector(`.ar-type-${rowType}`);
    if (active) active.style.display = '';
  }

  function getCompListId(rowId, rowType) {
    if (rowType === 'button') return `arCompList_${rowId}`;
    if (rowType === 'emoji')  return `arEmojiList_${rowId}`;
    return `arOptList_${rowId}`;
  }

  /**
   * Add a button (compType='button') or option/emoji (compType='option') to a row.
   */
  function addARComponent(rowId, data, compType) {
    const rowEl = document.querySelector(`.ar-row[data-row-id="${rowId}"]`);
    if (!rowEl) return;

    // Determine actual row type from the select
    const rowType = rowEl.querySelector('.ar-row-type-select')?.value || 'button';
    const listId  = getCompListId(rowId, rowType);
    const list    = document.getElementById(listId);
    if (!list) return;

    const maxItems = rowType === 'button' ? 5 : 25;
    if (list.children.length >= maxItems) {
      showToast(`Maximum ${maxItems} ${rowType === 'button' ? 'buttons' : 'options'} per row`, 'error');
      return;
    }

    const compNum = ++arCompCount;
    const compId  = data?.optId || `comp${compNum}`;
    const style   = data?.style || 'primary';
    const action  = data?.action || 'role';
    const isEmoji = rowType === 'emoji';
    const isBttn  = rowType === 'button';

    // Title shown in collapsed header
    const titleText = data?.label
      ? (data.emoji ? data.emoji + ' ' + data.label : data.label)
      : (isEmoji ? 'New Emoji' : isBttn ? 'New Button' : 'New Option');

    const compEl = document.createElement('div');
    compEl.className = 'ar-comp open';
    compEl.dataset.compId = compId;
    compEl.dataset.rowId  = rowId;

    compEl.innerHTML = `
      <div class="ar-comp-header">
        <span class="ar-comp-title">${esc(titleText)}</span>
        <span class="ar-comp-chevron">▾</span>
        <button class="btn btn-sm btn-danger" style="font-size:0.7rem;padding:1px 7px;margin-left:0.35rem"
          data-action="remove-ar-comp" data-comp-id="${compId}">✕</button>
      </div>
      <div class="ar-comp-body">

        ${isEmoji ? `
          <label class="bf-label">Emoji <span class="required">*</span>
            <input type="text" class="ar-comp-label" maxlength="100"
              placeholder="e.g. 👍 or &lt;:name:id&gt;" value="${esc(data?.label || '')}" data-live-preview>
          </label>
        ` : `
          <div class="bf-row">
            <label class="bf-label" style="flex:2">Label <span class="required">*</span>
              <input type="text" class="ar-comp-label" maxlength="80"
                placeholder="${isBttn ? 'Button label…' : 'Option label…'}" value="${esc(data?.label || '')}" data-live-preview>
            </label>
            <label class="bf-label">Emoji
              <input type="text" class="ar-comp-emoji" maxlength="100"
                placeholder="🎮" value="${esc(data?.emoji || '')}" data-live-preview>
            </label>
          </div>
        `}

        ${!isEmoji && !isBttn ? `
          <label class="bf-label">Description
            <input type="text" class="ar-comp-desc" maxlength="100"
              placeholder="Option description (optional)" value="${esc(data?.description || '')}" data-live-preview>
          </label>
        ` : ''}

        ${isBttn ? `
          <label class="bf-label">Style</label>
          <div class="ar-style-row">
            <button type="button" class="ar-style-btn${style === 'primary'   ? ' selected' : ''}" data-style="primary">Primary</button>
            <button type="button" class="ar-style-btn${style === 'secondary' ? ' selected' : ''}" data-style="secondary">Secondary</button>
            <button type="button" class="ar-style-btn${style === 'success'   ? ' selected' : ''}" data-style="success">Success</button>
            <button type="button" class="ar-style-btn${style === 'danger'    ? ' selected' : ''}" data-style="danger">Danger</button>
            <button type="button" class="ar-style-btn${style === 'link'      ? ' selected' : ''}" data-style="link">Link</button>
          </div>
          <input type="hidden" class="ar-comp-style" value="${esc(style)}">

          <label class="bf-label ar-comp-url-row" style="${style !== 'link' ? 'display:none' : ''}">
            URL <span class="required">*</span>
            <input type="url" class="ar-comp-url" placeholder="https://…" value="${esc(data?.url || '')}" data-live-preview>
          </label>
        ` : ''}

        <div class="ar-action-section" style="${(isBttn && style === 'link') ? 'display:none' : ''}">
          <label class="bf-label">Action <span class="required">*</span>
            <select class="ar-comp-action">
              <option value="role"    ${(!action || action === 'role')    ? 'selected' : ''}>Give / Remove Role</option>
              <option value="message" ${action === 'message' ? 'selected' : ''}>Send Ephemeral Message</option>
              <option value="dm"      ${action === 'dm'      ? 'selected' : ''}>Send DM</option>
            </select>
          </label>

          <div class="ar-action-role" style="${action !== 'role' ? 'display:none' : ''}">
            <label class="bf-label">Role <span class="required">*</span>
              <select class="ar-comp-role">
                <option value="">Select a role…</option>
                ${guildRoles.map((r) => `<option value="${esc(r.id)}" ${data?.roleId === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
              </select>
            </label>
            <label class="bf-toggle-row">
              <input type="checkbox" class="ar-comp-toggle" ${data?.toggleRole !== false ? 'checked' : ''}>
              Toggle (click again to remove role)
            </label>
          </div>

          <div class="ar-action-msg" style="${(action !== 'message' && action !== 'dm') ? 'display:none' : ''}">
            <label class="bf-label">Response Format
              <select class="ar-comp-content-type">
                <option value="message" ${(!data?.contentType || data.contentType === 'message') ? 'selected' : ''}>Plain Message</option>
                <option value="embed"   ${data?.contentType === 'embed' ? 'selected' : ''}>Embed</option>
              </select>
            </label>
            <label class="bf-label">Content <span class="required">*</span>
              <textarea class="ar-comp-content" rows="2" maxlength="2000"
                placeholder="Message to send…">${esc(data?.content || '')}</textarea>
            </label>
          </div>
        </div>

      </div>`;

    // Wire up action select
    compEl.querySelector('.ar-comp-action').addEventListener('change', () => {
      applyARActionVisibility(compEl);
      updatePreview();
    });

    // Live preview on any input
    compEl.querySelectorAll('input, textarea, select').forEach((el) => {
      el.addEventListener('input', () => {
        // Update collapsed title when label/emoji changes
        const labelEl = compEl.querySelector('.ar-comp-label');
        const emojiEl = compEl.querySelector('.ar-comp-emoji');
        const title   = compEl.querySelector('.ar-comp-title');
        if (title && labelEl) {
          const e2 = emojiEl?.value.trim();
          title.textContent = labelEl.value.trim() || (isEmoji ? 'New Emoji' : isBttn ? 'New Button' : 'New Option');
          if (e2 && !isEmoji) title.textContent = e2 + ' ' + title.textContent;
        }
        updatePreview();
      });
    });

    list.appendChild(compEl);
    updatePreview();
  }

  function applyARActionVisibility(compEl) {
    if (!compEl) return;
    const action  = compEl.querySelector('.ar-comp-action')?.value  || 'role';
    const roleDiv = compEl.querySelector('.ar-action-role');
    const msgDiv  = compEl.querySelector('.ar-action-msg');
    if (roleDiv) roleDiv.style.display = action === 'role' ? '' : 'none';
    if (msgDiv)  msgDiv.style.display  = (action === 'message' || action === 'dm') ? '' : 'none';

    const ctSel = compEl.querySelector('.ar-comp-content-type');
    const ctLbl = compEl.querySelector('.ar-comp-content');
    if (ctSel && ctLbl) {
      ctLbl.placeholder = ctSel.value === 'embed' ? 'Embed description to send…' : 'Message to send…';
    }
  }

  /** Collect all action rows from the DOM */
  function collectActionRows() {
    return Array.from(document.querySelectorAll('#builderActionRowsList .ar-row')).map((rowEl) => {
      const rowId   = rowEl.dataset.rowId;
      const rowType = rowEl.querySelector('.ar-row-type-select')?.value || 'button';

      const listId  = getCompListId(rowId, rowType);
      const list    = document.getElementById(listId);
      const options = list ? Array.from(list.querySelectorAll('.ar-comp')).map((compEl) => {
        const style  = compEl.querySelector('.ar-comp-style')?.value || 'primary';
        const action = compEl.querySelector('.ar-comp-action')?.value || 'role';
        return {
          optId:       compEl.dataset.compId,
          label:       compEl.querySelector('.ar-comp-label')?.value.trim() || '',
          emoji:       compEl.querySelector('.ar-comp-emoji')?.value.trim() || null,
          description: compEl.querySelector('.ar-comp-desc')?.value.trim() || null,
          style,
          url:         compEl.querySelector('.ar-comp-url')?.value.trim() || null,
          action,
          roleId:      compEl.querySelector('.ar-comp-role')?.value || null,
          toggleRole:  compEl.querySelector('.ar-comp-toggle')?.checked !== false,
          content:     compEl.querySelector('.ar-comp-content')?.value.trim() || null,
          contentType: compEl.querySelector('.ar-comp-content-type')?.value || 'message',
        };
      }) : [];

      const placeholder = rowEl.querySelector('.ar-sel-placeholder')?.value.trim() || null;

      return { rowId, rowType, placeholder, options };
    });
  }

  /** Render action row preview HTML for the Discord preview panel */
  function renderARPreview() {
    const rows = collectActionRows();
    if (!rows.length) return '';

    const STYLE_MAP = { primary: 'dp-btn-primary', secondary: 'dp-btn-secondary', success: 'dp-btn-success', danger: 'dp-btn-danger', link: 'dp-btn-link' };
    let html = '';

    for (const row of rows) {
      if (row.rowType === 'button' && row.options.length) {
        html += '<div class="dp-action-row">';
        for (const opt of row.options.slice(0, 5).filter((o) => o.label)) {
          const cls = STYLE_MAP[opt.style] || 'dp-btn-primary';
          const em  = opt.emoji ? `<span>${esc(opt.emoji)}</span>` : '';
          html += `<div class="dp-btn ${cls}">${em}${esc(opt.label)}</div>`;
        }
        html += '</div>';
      } else if (row.rowType === 'select' && row.options.length) {
        const first = row.options.find((o) => o.label);
        const ph    = row.placeholder || 'Select an option…';
        html += `<div class="dp-action-row"><div class="dp-select">${esc(first ? first.label : ph)}</div></div>`;
      } else if (row.rowType === 'emoji' && row.options.length) {
        html += '<div class="dp-reactions">';
        for (const opt of row.options.filter((o) => o.label)) {
          html += `<div class="dp-reaction">${esc(opt.label)} <span style="font-size:0.75rem;opacity:.7">1</span></div>`;
        }
        html += '</div>';
      }
    }
    return html;
  }

  // ── Attach to Existing Message modal ─────────────────────────

  function openAttachModal() {
    if (!editingId) {
      showToast('Save the message first before attaching to an existing Discord message', 'error');
      return;
    }
    const actionRows = collectActionRows();
    if (!actionRows.length) {
      showToast('Add at least one action row before attaching', 'error');
      return;
    }
    document.getElementById('attachMsgUrl').value = '';
    document.getElementById('attachMsgStatus').textContent = '';
    const backdrop = document.getElementById('attachMsgBackdrop');
    if (backdrop) { backdrop.setAttribute('aria-hidden', 'false'); backdrop.classList.add('open'); }
    document.body.style.overflow = 'hidden';
  }

  function closeAttachModal() {
    const backdrop = document.getElementById('attachMsgBackdrop');
    if (backdrop) { backdrop.setAttribute('aria-hidden', 'true'); backdrop.classList.remove('open'); }
    document.body.style.overflow = '';
  }

  async function doAttach() {
    const messageUrl = document.getElementById('attachMsgUrl')?.value.trim();
    const statusEl   = document.getElementById('attachMsgStatus');
    const confirmBtn = document.getElementById('attachMsgConfirm');
    if (!messageUrl) {
      if (statusEl) statusEl.textContent = '⚠ Please paste a Discord message URL.';
      return;
    }
    if (!/channels\/\d+\/\d+\/\d+/.test(messageUrl)) {
      if (statusEl) statusEl.textContent = '⚠ Invalid URL — must be a Discord message link (discord.com/channels/…/…/…)';
      return;
    }

    if (confirmBtn) confirmBtn.disabled = true;
    if (statusEl) statusEl.textContent = 'Attaching…';

    try {
      const r = await fetch(`/api/guild/${guildId}/messages/${editingId}/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageUrl }),
      });
      const result = await r.json();
      if (!r.ok) {
        if (statusEl) statusEl.textContent = '✗ ' + (result.error || 'Failed to attach');
        return;
      }
      closeAttachModal();
      showToast('Components attached to message! ✅', 'success');
    } catch (e) {
      if (statusEl) statusEl.textContent = '✗ ' + e.message;
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
    }
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
    } else if (type === 'ephemeral') {
      html = `
        <p class="bf-hint">👁️ <strong>Ephemeral Response:</strong> This message will only be visible to the user who triggered the command. Perfect for sensitive information or personalized replies.</p>
        <label class="bf-label">Trigger Command
          <input type="text" id="dcCommandTrigger" maxlength="100" value="${esc(delivery.commandTrigger || '')}"
            placeholder="e.g. /stats or !profile">
        </label>
        <label class="bf-label">Required Role <small style="font-weight:400;opacity:.6">(optional)</small>
          <select id="dcCommandRole">
            <option value="">— Anyone —</option>${roleOpts}
          </select>
        </label>
        <p class="bf-hint" style="background:rgba(158,130,193,0.1);border-color:rgba(158,130,193,0.3)">💡 Configure embeds above — this response will send only those embeds, no content text or action rows.</p>`;
    } else if (type === 'dm') {
      html = `
        <p class="bf-hint">💬 <strong>Direct Message:</strong> This message will be sent as a DM to the user who triggered the command.</p>
        <label class="bf-label">Trigger Command
          <input type="text" id="dcCommandTrigger" maxlength="100" value="${esc(delivery.commandTrigger || '')}"
            placeholder="e.g. /welcome or !rules">
        </label>
        <label class="bf-label">Required Role <small style="font-weight:400;opacity:.6">(optional)</small>
          <select id="dcCommandRole">
            <option value="">— Anyone —</option>${roleOpts}
          </select>
        </label>
        <p class="bf-hint" style="background:rgba(88,155,255,0.1);border-color:rgba(88,155,255,0.3)">💡 Configure embeds above — this DM will send only those embeds, no content text or action rows.</p>`;
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
    if (['command', 'ephemeral', 'dm'].includes(type)) {
      d.commandTrigger        = val('dcCommandTrigger');
      d.commandRequiredRoleId = val('dcCommandRole');
    }
    return d;
  }

  // ── Preview renderer ──────────────────────────────────────────
  window.updatePreview = function () {
    const previewContent    = document.getElementById('previewContent');
    const previewEmbeds     = document.getElementById('previewEmbeds');
    const previewComponents = document.getElementById('previewComponents');
    if (!previewContent || !previewEmbeds) return;

    // Set timestamp
    const ts = document.getElementById('previewTimestamp');
    if (ts) ts.textContent = 'Today at ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const content = document.getElementById('builderContent')?.value || '';
    previewContent.innerHTML = content ? `<div class="discord-content">${esc(content)}</div>` : '';

    const embedPanels = document.querySelectorAll('#builderEmbedsList .embed-panel');
    const embedsHtml  = Array.from(embedPanels).map((panel) => renderEmbedPreview(panel)).join('');
    previewEmbeds.innerHTML = embedsHtml || '';

    // Render action row components preview
    if (previewComponents) {
      previewComponents.innerHTML = renderARPreview();
    }

    if (!content && !embedsHtml && !previewComponents?.innerHTML) {
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
      actionRows: collectActionRows(),
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

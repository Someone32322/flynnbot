/**
 * reactionroles.js — Dashboard client for the Reaction Roles section.
 * Loaded on server.ejs. Initialises when #section-reaction-roles becomes active.
 */
(function () {
  'use strict';

  const SAPPHIRE = 0x0f52ba;
  const STYLE_COLORS = { primary: '#5865f2', secondary: '#4e5058', success: '#248046', danger: '#da373c' };

  // ── State ────────────────────────────────────────────────────
  let guildId = null;
  let allRR = [];
  let editingRRId = null;
  let guildRoles = [];
  let guildChannels = [];
  let initialized = false;
  let creationMode = 'new';

  // ── Helpers ──────────────────────────────────────────────────
  function escHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function hexFromInt(n) {
    return '#' + Math.abs(n ?? SAPPHIRE).toString(16).padStart(6, '0');
  }

  function intFromHex(hex) {
    return parseInt((hex ?? '#0f52ba').replace('#', ''), 16);
  }

  function genOptId() {
    return Math.random().toString(36).slice(2, 10).toUpperCase();
  }

  // ── Init ─────────────────────────────────────────────────────
  function initRR() {
    if (initialized) return;
    initialized = true;
    const pageData = document.getElementById('pageData');
    guildId = pageData?.dataset?.guildId;
    if (!guildId) return;
    bindUI();
    loadAll();
  }

  function bindUI() {
    document.getElementById('rrNewBtn').addEventListener('click', async () => {
      const mode = await chooseCreateMode();
      if (!mode) return;
      creationMode = mode;
      openEditor(null, { useExistingMessage: mode === 'existing' });
    });
    document.getElementById('rrEditorClose').addEventListener('click', closeEditor);
    document.getElementById('rrEditorCancel').addEventListener('click', closeEditor);
    document.getElementById('rrEditorSave').addEventListener('click', () => saveRR(false));
    document.getElementById('rrEditorPost').addEventListener('click', () => saveRR(true));
    document.getElementById('rrAddOption').addEventListener('click', () => addOptionRow(null));

    // Type toggle
    document.getElementById('rrType').addEventListener('change', () => {
      updateTypeVisibility();
      updatePreview();
    });

    // Live preview on text changes
    ['rrEmbedTitle', 'rrEmbedDesc', 'rrEmbedColor', 'rrMessageUrl'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updatePreview);
    });

    // Close on backdrop click
    document.getElementById('rrEditorBackdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeEditor();
    });

    // Delegated events for list actions
    document.getElementById('rrList').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-rr-action]');
      if (!btn) return;
      const id = btn.dataset.rrId;
      const action = btn.dataset.rrAction;
      if (action === 'edit') {
        const rr = allRR.find((r) => r._id === id);
        if (rr) openEditor(rr);
      } else if (action === 'delete') {
        await deleteRR(id);
      } else if (action === 'post') {
        await postRR(id);
      }
    });
  }

  function chooseCreateMode() {
    return new Promise((resolve) => {
      const backdrop = document.getElementById('rrCreateChoiceBackdrop');
      if (!backdrop) {
        resolve('new');
        return;
      }

      const close = (result) => {
        backdrop.classList.remove('open');
        backdrop.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        resolve(result);
      };

      const existingBtn = document.getElementById('rrCreateChoiceExisting');
      const newBtn = document.getElementById('rrCreateChoiceNew');
      const cancelBtn = document.getElementById('rrCreateChoiceCancel');

      const onBackdropClick = (e) => {
        if (e.target === backdrop) close(null);
      };
      const onExisting = () => close('existing');
      const onNew = () => close('new');
      const onCancel = () => close(null);

      existingBtn?.addEventListener('click', onExisting, { once: true });
      newBtn?.addEventListener('click', onNew, { once: true });
      cancelBtn?.addEventListener('click', onCancel, { once: true });
      backdrop.addEventListener('click', onBackdropClick, { once: true });

      backdrop.classList.add('open');
      backdrop.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    });
  }

  async function loadAll() {
    const container = document.getElementById('rrList');
    container.innerHTML = '<div class="commands-loading"><div class="spinner"></div>Loading…</div>';
    try {
      const [rrRes, rolesRes, chRes] = await Promise.allSettled([
        fetch(`/api/guild/${guildId}/reaction-roles`),
        fetch(`/api/guild/${guildId}/roles`),
        fetch(`/api/guild/${guildId}/channels`),
      ]);

      if (rrRes.status !== 'fulfilled') throw rrRes.reason || new Error('Failed to load reaction roles');
      if (!rrRes.value.ok) throw new Error('Failed to load reaction roles');
      allRR = await rrRes.value.json();

      if (rolesRes.status === 'fulfilled' && rolesRes.value.ok) {
        guildRoles = await rolesRes.value.json();
      } else {
        guildRoles = [];
      }

      if (chRes.status === 'fulfilled' && chRes.value.ok) {
        guildChannels = (await chRes.value.json()).filter((c) => [0, 5].includes(c.type));
      } else {
        guildChannels = [];
      }

      renderList();
    } catch (err) {
      container.innerHTML = `<p class="error-text">Failed to load: ${escHtml(err.message)}</p>`;
    }
  }

  function renderList() {
    const container = document.getElementById('rrList');
    if (!allRR.length) {
      container.innerHTML = '<p class="empty-state">No reaction role groups yet. Click "+ New Group" to create one.</p>';
      return;
    }
    container.innerHTML = allRR.map((rr) => {
      const typeBadge = { button: '🔘 Buttons', dropdown: '📋 Dropdown', emoji: '😀 Emoji' }[rr.type] || rr.type;
      const statusBadge = rr.messageId || rr.externalMessageId
        ? '<span class="rr-status-live">● Live</span>'
        : '<span class="rr-status-draft">○ Draft</span>';
      return `
        <div class="rr-card rr-anim">
          <div class="rr-card-left">
            <div class="rr-card-name">${escHtml(rr.name)}</div>
            <div class="rr-card-meta">
              <span class="rr-type-badge">${typeBadge}</span>
              ${statusBadge}
              <span class="rr-opt-count">${rr.options.length} option${rr.options.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <div class="rr-card-actions">
            <button class="btn btn-sm" data-rr-action="post" data-rr-id="${escHtml(rr._id)}" title="${rr.messageId ? 'Update Discord message' : 'Post to Discord'}">
              ${rr.messageId || rr.externalMessageId ? '↻ Update' : '▶ Post'}
            </button>
            <button class="btn btn-sm" data-rr-action="edit" data-rr-id="${escHtml(rr._id)}">Edit</button>
            <button class="btn btn-sm btn-danger" data-rr-action="delete" data-rr-id="${escHtml(rr._id)}">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Editor ───────────────────────────────────────────────────
  async function openEditor(rr, opts = {}) {
    if (!guildRoles.length || !guildChannels.length) {
      await hydrateGuildAssets();
    }

    editingRRId = rr ? rr._id : null;
    creationMode = rr ? (rr.messageUrl ? 'existing' : 'new') : (opts.useExistingMessage ? 'existing' : 'new');

    const typeSel = document.getElementById('rrType');
    document.getElementById('rrEditorTitle').textContent = rr ? `Edit: ${rr.name}` : 'New Reaction Role Group';
    document.getElementById('rrName').value = rr?.name ?? '';
    document.getElementById('rrName').disabled = !!rr;
    typeSel.value = rr?.type ?? (creationMode === 'existing' ? 'emoji' : 'button');
    typeSel.disabled = !rr && creationMode === 'existing';
    document.getElementById('rrEmbedTitle').value = rr?.embedTitle ?? 'Reaction Roles';
    document.getElementById('rrEmbedDesc').value = rr?.embedDescription ?? 'Click a button or select an option below.';
    document.getElementById('rrEmbedColor').value = hexFromInt(rr?.embedColor);
    document.getElementById('rrMessageUrl').value = rr?.messageUrl ?? (opts.useExistingMessage ? 'https://discord.com/channels/' : '');
    const modeHint = document.getElementById('rrCreateModeHint');
    if (modeHint) {
      modeHint.style.display = creationMode === 'existing' ? '' : 'none';
      modeHint.textContent = 'Using existing message mode: this group is emoji-only.';
    }

    // Populate channel dropdown
    const chanSel = document.getElementById('rrChannel');
    chanSel.innerHTML = '<option value="">Select a channel…</option>' +
      guildChannels.map((c) => `<option value="${escHtml(c.id)}" ${rr?.channelId === c.id ? 'selected' : ''}>#${escHtml(c.name)}</option>`).join('');

    if (!guildChannels.length) {
      chanSel.innerHTML = '<option value="">No text channels available</option>';
    }

    // Build options list
    const optList = document.getElementById('rrOptionsList');
    optList.innerHTML = '';
    (rr?.options ?? []).forEach((o) => addOptionRow(o));

    updateTypeVisibility();
    updatePreview();

    const backdrop = document.getElementById('rrEditorBackdrop');
    backdrop.setAttribute('aria-hidden', 'false');
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeEditor() {
    const backdrop = document.getElementById('rrEditorBackdrop');
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
    editingRRId = null;
    creationMode = 'new';
    const typeSel = document.getElementById('rrType');
    if (typeSel) typeSel.disabled = false;
  }

  function updateTypeVisibility() {
    const type = document.getElementById('rrType').value;
    document.getElementById('rrBotMessageConfig').style.display = type !== 'emoji' ? '' : 'none';
    document.getElementById('rrEmojiConfig').style.display = type === 'emoji' ? '' : 'none';

    // Update add-option button label depending on type
    const addBtn = document.getElementById('rrAddOption');
    if (type === 'emoji') addBtn.textContent = '+ Add Emoji';
    else if (type === 'dropdown') addBtn.textContent = '+ Add Option';
    else addBtn.textContent = '+ Add Button';

    // Re-render option rows to show/hide type-specific fields
    const rows = document.querySelectorAll('.rr-option-row');
    rows.forEach((row) => updateOptionRowVisibility(row, type));
  }

  // ── Option rows ──────────────────────────────────────────────
  function addOptionRow(opt) {
    const type = document.getElementById('rrType').value;
    const row = document.createElement('div');
    row.className = 'rr-option-row rr-anim';
    row.dataset.optId = opt?.optId ?? genOptId();

    row.innerHTML = `
      <div class="rr-option-header">
        <span class="rr-option-num">Option</span>
        <button type="button" class="btn btn-sm btn-danger rr-opt-remove">✕</button>
      </div>
      <div class="rr-option-body">
        <div class="rr-option-row-fields">
          <label class="rr-label rr-opt-label-field">
            <span class="rr-opt-label-text">Label</span> <span class="required rr-opt-label-required">*</span>
            <input type="text" class="rr-opt-label" placeholder="e.g. 🎮 Gaming" maxlength="80" value="${escHtml(opt?.label ?? '')}" />
          </label>
          <label class="rr-label rr-opt-emoji-field">
            Emoji
            <input type="text" class="rr-opt-emoji" placeholder="e.g. 🎮 or :emoji:" maxlength="100" value="${escHtml(opt?.emoji ?? '')}" />
          </label>
          <label class="rr-label rr-opt-style-field">
            Style
            <select class="rr-opt-style">
              <option value="primary" ${(!opt?.style || opt?.style === 'primary') ? 'selected' : ''}>Primary (Blue)</option>
              <option value="secondary" ${opt?.style === 'secondary' ? 'selected' : ''}>Secondary (Grey)</option>
              <option value="success" ${opt?.style === 'success' ? 'selected' : ''}>Success (Green)</option>
              <option value="danger" ${opt?.style === 'danger' ? 'selected' : ''}>Danger (Red)</option>
            </select>
          </label>
          <label class="rr-label rr-opt-desc-field">
            Description
            <input type="text" class="rr-opt-desc" placeholder="Dropdown option description" maxlength="100" value="${escHtml(opt?.description ?? '')}" />
          </label>
        </div>
        <div class="rr-option-action-fields">
          <label class="rr-label">
            Action <span class="required">*</span>
            <select class="rr-opt-action">
              <option value="role" ${(!opt?.action || opt?.action === 'role') ? 'selected' : ''}>Give / Remove Role</option>
              <option value="message" ${opt?.action === 'message' ? 'selected' : ''}>Send Ephemeral Message</option>
              <option value="dm" ${opt?.action === 'dm' ? 'selected' : ''}>Send DM</option>
            </select>
          </label>
          <div class="rr-action-role" style="${(!opt?.action || opt?.action === 'role') ? '' : 'display:none'}">
            <label class="rr-label">
              Role <span class="required">*</span>
              <select class="rr-opt-role">
                <option value="">Select a role…</option>
                ${guildRoles.map((r) => `<option value="${escHtml(r.id)}" ${opt?.roleId === r.id ? 'selected' : ''}>${escHtml(r.name)}</option>`).join('')}
              </select>
            </label>
            <label class="rr-label rr-toggle-label">
              <input type="checkbox" class="rr-opt-toggle" ${opt?.toggleRole !== false ? 'checked' : ''} />
              Toggle (click again to remove role)
            </label>
          </div>
          <div class="rr-action-msg" style="${(opt?.action === 'message' || opt?.action === 'dm') ? '' : 'display:none'}">
            <label class="rr-label rr-opt-content-type-field">
              Response Format <span class="required">*</span>
              <select class="rr-opt-content-type">
                <option value="message" ${(!opt?.contentType || opt?.contentType === 'message') ? 'selected' : ''}>Plain Message</option>
                <option value="embed" ${opt?.contentType === 'embed' ? 'selected' : ''}>Embed</option>
              </select>
            </label>
            <label class="rr-label rr-opt-plain-wrap">
              <span class="rr-opt-content-label">Message Content</span> <span class="required">*</span>
              <textarea class="rr-opt-content" rows="3" placeholder="Message to send…" maxlength="2000">${escHtml(opt?.content ?? '')}</textarea>
            </label>
            <div class="rr-opt-embed-wrap" style="${opt?.contentType === 'embed' ? '' : 'display:none'}">
              <label class="rr-label">
                Embed Title
                <input type="text" class="rr-opt-embed-title" maxlength="256" value="${escHtml(opt?.embedTitle ?? '')}" placeholder="Optional embed title" />
              </label>
              <label class="rr-label">
                Embed Description
                <textarea class="rr-opt-embed-description" rows="3" maxlength="4096" placeholder="Embed description">${escHtml(opt?.embedDescription ?? '')}</textarea>
              </label>
              <div class="rr-option-row-fields">
                <label class="rr-label">
                  Embed Color
                  <input type="color" class="rr-opt-embed-color" value="${hexFromInt(opt?.embedColor ?? SAPPHIRE)}" />
                </label>
                <label class="rr-label">
                  Embed Footer
                  <input type="text" class="rr-opt-embed-footer" maxlength="2048" value="${escHtml(opt?.embedFooter ?? '')}" placeholder="Optional footer text" />
                </label>
              </div>
              <div class="rr-option-row-fields">
                <label class="rr-label">
                  Embed Image URL
                  <input type="url" class="rr-opt-embed-image" value="${escHtml(opt?.embedImageUrl ?? '')}" placeholder="https://..." />
                </label>
                <label class="rr-label">
                  Embed Thumbnail URL
                  <input type="url" class="rr-opt-embed-thumbnail" value="${escHtml(opt?.embedThumbnailUrl ?? '')}" placeholder="https://..." />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Wire up action toggle
    const actionSel = row.querySelector('.rr-opt-action');
    actionSel.addEventListener('change', () => {
      applyActionVisibility(row);
      updatePreview();
    });

    const contentTypeSel = row.querySelector('.rr-opt-content-type');
    if (contentTypeSel) {
      contentTypeSel.addEventListener('change', () => {
        applyActionVisibility(row);
        updatePreview();
      });
    }

    row.querySelector('.rr-opt-remove').addEventListener('click', () => { row.remove(); updatePreview(); });
    row.querySelectorAll('input, textarea, select').forEach((el) => el.addEventListener('input', updatePreview));

    document.getElementById('rrOptionsList').appendChild(row);
    if (!guildRoles.length) {
      const roleSel = row.querySelector('.rr-opt-role');
      if (roleSel) roleSel.innerHTML = '<option value="">No roles available</option>';
    }
    updateOptionRowVisibility(row, type);
    updatePreview();
  }

  async function hydrateGuildAssets() {
    const [rolesRes, chRes] = await Promise.allSettled([
      fetch(`/api/guild/${guildId}/roles`),
      fetch(`/api/guild/${guildId}/channels`),
    ]);

    if (rolesRes.status === 'fulfilled' && rolesRes.value.ok) {
      guildRoles = await rolesRes.value.json();
    }

    if (chRes.status === 'fulfilled' && chRes.value.ok) {
      guildChannels = (await chRes.value.json()).filter((c) => [0, 5].includes(c.type));
    }
  }

  function updateOptionRowVisibility(row, type) {
    const isEmoji = type === 'emoji';
    const isDropdown = type === 'dropdown';
    const isButton = type === 'button';

    row.querySelector('.rr-opt-label-field').style.display = '';
    row.querySelector('.rr-opt-emoji-field').style.display = isButton || isDropdown ? '' : 'none';
    row.querySelector('.rr-opt-style-field').style.display = isButton ? '' : 'none';
    row.querySelector('.rr-opt-desc-field').style.display = isDropdown ? '' : 'none';

    const labelInput = row.querySelector('.rr-opt-label');
    const labelText = row.querySelector('.rr-opt-label-text');
    const required = row.querySelector('.rr-opt-label-required');
    if (labelText) labelText.textContent = isEmoji ? 'Emoji' : 'Label';
    if (required) required.style.display = isEmoji ? 'none' : '';
    if (labelInput) {
      labelInput.placeholder = isEmoji
        ? 'e.g. 👍 or <:name:id>'
        : 'e.g. 🎮 Gaming';
    }

    applyActionVisibility(row);
  }

  function applyActionVisibility(row) {
    const action = row.querySelector('.rr-opt-action')?.value || 'role';
    const roleEl = row.querySelector('.rr-action-role');
    const msgEl = row.querySelector('.rr-action-msg');
    if (roleEl) roleEl.style.display = action === 'role' ? '' : 'none';
    if (msgEl) msgEl.style.display = (action === 'message' || action === 'dm') ? '' : 'none';

    const contentType = row.querySelector('.rr-opt-content-type')?.value || 'message';
    const contentLabel = row.querySelector('.rr-opt-content-label');
    const contentInput = row.querySelector('.rr-opt-content');
    const plainWrap = row.querySelector('.rr-opt-plain-wrap');
    const embedWrap = row.querySelector('.rr-opt-embed-wrap');
    if (contentLabel) {
      contentLabel.textContent = contentType === 'embed' ? 'Embed Description' : 'Message Content';
    }
    if (contentInput) {
      contentInput.placeholder = contentType === 'embed' ? 'Embed description to send…' : 'Message to send…';
    }
    if (plainWrap) plainWrap.style.display = contentType === 'embed' ? 'none' : '';
    if (embedWrap) embedWrap.style.display = contentType === 'embed' ? '' : 'none';
  }

  // ── Live preview ─────────────────────────────────────────────
  function updatePreview() {
    const type = document.getElementById('rrType').value;
    const title = document.getElementById('rrEmbedTitle').value.trim();
    const desc = document.getElementById('rrEmbedDesc').value.trim();
    const color = document.getElementById('rrEmbedColor').value;

    document.getElementById('rrPreviewBar').style.background = color;
    const titleEl = document.getElementById('rrPreviewTitle');
    const descEl = document.getElementById('rrPreviewDesc');
    titleEl.textContent = title;
    titleEl.style.display = title ? '' : 'none';
    descEl.textContent = desc;
    descEl.style.display = desc ? '' : 'none';

    const compEl = document.getElementById('rrPreviewComponents');
    compEl.innerHTML = '';

    const options = collectOptions();

    if (type === 'button') {
      const styleMap = { primary: '#5865f2', secondary: '#4e5058', success: '#248046', danger: '#da373c' };
      const row = document.createElement('div');
      row.className = 'rr-preview-btns';
      options.slice(0, 5).forEach((opt) => {
        const btn = document.createElement('div');
        btn.className = 'rr-preview-btn';
        btn.style.background = styleMap[opt.style] || '#5865f2';
        btn.textContent = (opt.emoji ? opt.emoji + ' ' : '') + (opt.label || 'Button');
        row.appendChild(btn);
      });
      if (options.length > 5) {
        const more = document.createElement('span');
        more.className = 'rr-preview-more';
        more.textContent = `+${options.length - 5} more`;
        row.appendChild(more);
      }
      compEl.appendChild(row);
    } else if (type === 'dropdown') {
      const sel = document.createElement('div');
      sel.className = 'rr-preview-dropdown';
      sel.textContent = options.length ? `${options[0].label || 'Select an option…'}` : 'Select an option…';
      compEl.appendChild(sel);
    } else if (type === 'emoji') {
      const emojis = document.createElement('div');
      emojis.className = 'rr-preview-emojis';
      options.forEach((opt) => {
        const e = document.createElement('span');
        e.className = 'rr-preview-emoji';
        e.textContent = opt.label || '?';
        emojis.appendChild(e);
      });
      compEl.appendChild(emojis);
    }
  }

  function collectOptions() {
    return Array.from(document.querySelectorAll('.rr-option-row')).map((row) => ({
      optId:       row.dataset.optId || genOptId(),
      label:       row.querySelector('.rr-opt-label')?.value.trim() || '',
      emoji:       row.querySelector('.rr-opt-emoji')?.value.trim() || null,
      description: row.querySelector('.rr-opt-desc')?.value.trim() || null,
      style:       row.querySelector('.rr-opt-style')?.value || 'primary',
      action:      row.querySelector('.rr-opt-action')?.value || 'role',
      contentType: row.querySelector('.rr-opt-content-type')?.value || 'message',
      roleId:      row.querySelector('.rr-opt-role')?.value || null,
      toggleRole:  row.querySelector('.rr-opt-toggle')?.checked !== false,
      content:     row.querySelector('.rr-opt-content')?.value.trim() || null,
      embedTitle:       row.querySelector('.rr-opt-embed-title')?.value.trim() || null,
      embedDescription: row.querySelector('.rr-opt-embed-description')?.value.trim() || null,
      embedColor:       intFromHex(row.querySelector('.rr-opt-embed-color')?.value || '#0f52ba'),
      embedFooter:      row.querySelector('.rr-opt-embed-footer')?.value.trim() || null,
      embedImageUrl:    row.querySelector('.rr-opt-embed-image')?.value.trim() || null,
      embedThumbnailUrl:row.querySelector('.rr-opt-embed-thumbnail')?.value.trim() || null,
    }));
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

      if (opt.action === 'message' || opt.action === 'dm') {
        if (opt.contentType === 'embed' && !opt.embedTitle && !opt.embedDescription) {
          return `Option ${n}: Embed title or description is required for ${opt.action.toUpperCase()} action.`;
        }
        if (opt.contentType !== 'embed' && !opt.content) {
          return `Option ${n}: Message content is required for ${opt.action.toUpperCase()} action.`;
        }
      }
    }

    return null;
  }

  // ── Save ─────────────────────────────────────────────────────
  async function saveRR(andPost) {
    const name = document.getElementById('rrName').value.trim();
    const typeSel = document.getElementById('rrType');
    const messageUrl = document.getElementById('rrMessageUrl').value.trim() || null;
    const type = (!editingRRId && creationMode === 'existing') ? 'emoji' : typeSel.value;
    if (!name && !editingRRId) { showToast('Name is required.', 'error'); return; }

    if (messageUrl && type !== 'emoji') {
      showToast('Existing message links are only supported for emoji reaction roles.', 'error');
      return;
    }

    const options = collectOptions();
    const optionsError = validateOptions(options, type);
    if (optionsError) { showToast(optionsError, 'error'); return; }

    const payload = {
      type,
      channelId:        document.getElementById('rrChannel').value || null,
      messageUrl,
      embedTitle:       document.getElementById('rrEmbedTitle').value.trim(),
      embedDescription: document.getElementById('rrEmbedDesc').value.trim(),
      embedColor:       intFromHex(document.getElementById('rrEmbedColor').value),
      options,
    };
    if (!editingRRId) payload.name = name;

    const saveBtn = document.getElementById('rrEditorSave');
    const postBtn = document.getElementById('rrEditorPost');
    saveBtn.disabled = true;
    postBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      let rr;
      if (editingRRId) {
        const res = await fetch(`/api/guild/${guildId}/reaction-roles/${editingRRId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save');
        rr = await res.json();
      } else {
        const res = await fetch(`/api/guild/${guildId}/reaction-roles`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create');
        rr = await res.json();
        editingRRId = rr._id;
      }

      if (andPost) {
        const res2 = await fetch(`/api/guild/${guildId}/reaction-roles/${rr._id}/post`, { method: 'POST' });
        if (!res2.ok) throw new Error((await res2.json().catch(() => ({}))).error || 'Failed to post');
        showToast('Posted to Discord!', 'success');
      } else {
        showToast('Saved draft.', 'success');
      }

      closeEditor();
      await loadAll();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      saveBtn.disabled = false;
      postBtn.disabled = false;
      saveBtn.textContent = 'Save Draft';
    }
  }

  async function deleteRR(rrId) {
    const rr = allRR.find((r) => r._id === rrId);
    if (!rr) return;
    if (!confirm(`Delete reaction role group "${rr.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/guild/${guildId}/reaction-roles/${rrId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to delete');
      showToast('Deleted.', 'success');
      await loadAll();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }

  async function postRR(rrId) {
    const rr = allRR.find((r) => r._id === rrId);
    if (!rr) return;
    const btn = document.querySelector(`[data-rr-action="post"][data-rr-id="${rrId}"]`);
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      const res = await fetch(`/api/guild/${guildId}/reaction-roles/${rrId}/post`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to post');
      showToast('Posted to Discord!', 'success');
      await loadAll();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = rr.messageId ? '↻ Update' : '▶ Post'; }
    }
  }

  // ── Toast ────────────────────────────────────────────────────
  function showToast(msg, type) {
    if (typeof window.toast === 'function') {
      window.toast(msg, type);
    } else {
      console.log(`[RR] ${type}: ${msg}`);
    }
  }

  // ── Section activation ───────────────────────────────────────
  document.addEventListener('sectionActivated', (e) => {
    if (e.detail?.section === 'reaction-roles') initRR();
  });
})();

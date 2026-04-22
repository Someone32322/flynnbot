/* =====================================================================
   server.js — Commands dashboard client logic
   GUILD_ID is read from a data attribute to avoid CSP-blocked inline scripts.
   ===================================================================== */

(function () {
  // Use data attribute instead of inline script (inline scripts blocked by Helmet CSP)
  const GUILD_ID = document.getElementById('pageData')?.dataset?.guildId;
  if (!GUILD_ID) return;

  /* ------------------------------------------------------------------ */
  /*  State                                                               */
  /* ------------------------------------------------------------------ */
  let allCommands     = [];
  let guildRoles      = null; // lazy-loaded once
  let guildChannels   = null; // lazy-loaded once
  let guildConfig     = null; // { prefixEnabled, prefixes[] } — lazy-loaded once
  let activeFilter    = 'all';
  let searchTerm      = '';
  let openDropdownRow = null;
  let activeSettingsCmd = null;

  /* ------------------------------------------------------------------ */
  /*  Bootstrap                                                           */
  /* ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', () => {
    loadCommands();
    bindCategoryTabs();
    bindSearch();
    bindModalClose();
    bindPanelClose();
    document.addEventListener('click', handleOutsideClick);
  });

  /* ------------------------------------------------------------------ */
  /*  API helpers                                                         */
  /* ------------------------------------------------------------------ */
  async function apiFetch(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  /* ------------------------------------------------------------------ */
  /*  Commands list                                                       */
  /* ------------------------------------------------------------------ */
  async function loadCommands() {
    try {
      allCommands = await apiFetch(`/guild/${GUILD_ID}/commands`);
      renderCommands();
    } catch (err) {
      document.getElementById('commandsList').innerHTML =
        `<div class="commands-loading" style="color:#f87171">Failed to load commands: ${escHtml(err.message)}</div>`;
    }
  }

  function renderCommands() {
    const container = document.getElementById('commandsList');
    const term = searchTerm.toLowerCase();

    const filtered = allCommands.filter((cmd) => {
      const catMatch = activeFilter === 'all' || cmd.category === activeFilter;
      const searchMatch =
        !term ||
        cmd.name.toLowerCase().includes(term) ||
        cmd.description.toLowerCase().includes(term);
      return catMatch && searchMatch;
    });

    if (!filtered.length) {
      container.innerHTML = '<div class="commands-loading" style="color:var(--text-2)">No commands match your filter.</div>';
      return;
    }

    container.innerHTML = '';
    filtered.forEach((cmd, i) => {
      const row = buildCommandRow(cmd, i);
      container.appendChild(row);
    });
  }

  function buildCommandRow(cmd, i) {
    const row = document.createElement('div');
    row.className = `cmd-row${cmd.settings.enabled ? ' enabled' : ''}`;
    row.dataset.name = cmd.name;
    row.style.animationDelay = `${i * 30}ms`;

    const catClass = `cmd-badge-${cmd.category.toLowerCase()}`;
    const desc = cmd.settings.customDescription || cmd.description;

    row.innerHTML = `
      <div class="cmd-row-left">
        <div class="cmd-row-name">
          /${escHtml(cmd.name)}
          <span class="cmd-badge ${catClass}">${escHtml(cmd.category)}</span>
        </div>
        <div class="cmd-row-desc">${escHtml(desc)}</div>
      </div>
      <div class="cmd-row-actions">
        <button class="cmd-action-btn cmd-info-btn" title="Usage &amp; info" aria-label="Info for ${escHtml(cmd.name)}">?</button>
        <label class="toggle-switch" title="${cmd.settings.enabled ? 'Disable command' : 'Enable command'}">
          <input type="checkbox" class="cmd-toggle" ${cmd.settings.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <div style="position:relative">
          <button class="cmd-action-btn cmd-more-btn" title="More options" aria-label="More options for ${escHtml(cmd.name)}">⋯</button>
        </div>
      </div>
    `;

    // Toggle enable/disable
    const toggle = row.querySelector('.cmd-toggle');
    toggle.addEventListener('change', () => handleToggle(cmd, toggle, row));

    // Info modal
    row.querySelector('.cmd-info-btn').addEventListener('click', () => showInfoModal(cmd));

    // More dropdown
    row.querySelector('.cmd-more-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(cmd, row.querySelector('.cmd-more-btn'), row);
    });

    return row;
  }

  /* ------------------------------------------------------------------ */
  /*  Toggle enable/disable                                               */
  /* ------------------------------------------------------------------ */
  async function handleToggle(cmd, toggleEl, row) {
    const enabling = toggleEl.checked;
    toggleEl.disabled = true;

    try {
      await apiFetch(`/guild/${GUILD_ID}/commands/${cmd.name}/${enabling ? 'enable' : 'disable'}`, {
        method: 'POST',
      });
      cmd.settings.enabled = enabling;
      row.classList.toggle('enabled', enabling);
      toast(enabling ? `/${cmd.name} enabled` : `/${cmd.name} disabled`, 'success');
    } catch (err) {
      toggleEl.checked = !enabling; // revert
      toast(`Failed: ${err.message}`, 'error');
    } finally {
      toggleEl.disabled = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Dropdown menu                                                       */
  /* ------------------------------------------------------------------ */
  function toggleDropdown(cmd, btn, row) {
    // Close any open dropdown first
    if (openDropdownRow && openDropdownRow !== row) closeDropdown();

    const existing = row.querySelector('.cmd-dropdown');
    if (existing) { closeDropdown(); return; }

    const dropdown = document.createElement('div');
    dropdown.className = 'cmd-dropdown';
    dropdown.innerHTML = `
      <div class="cmd-dropdown-item" data-action="settings">
        ⚙️ &nbsp;Command Settings
      </div>
    `;

    dropdown.querySelector('[data-action="settings"]').addEventListener('click', () => {
      closeDropdown();
      openSettingsPanel(cmd);
    });

    btn.parentElement.appendChild(dropdown);
    openDropdownRow = row;
  }

  function closeDropdown() {
    if (openDropdownRow) {
      openDropdownRow.querySelector('.cmd-dropdown')?.remove();
      openDropdownRow = null;
    }
  }

  function handleOutsideClick(e) {
    if (openDropdownRow && !openDropdownRow.contains(e.target)) closeDropdown();
  }

  /* ------------------------------------------------------------------ */
  /*  Info modal                                                          */
  /* ------------------------------------------------------------------ */
  function showInfoModal(cmd) {
    const aliasHtml = cmd.aliases?.length
      ? cmd.aliases.map((a) => `<span class="modal-alias-chip">${escHtml(a)}</span>`).join('')
      : '<span style="color:var(--text-3);font-size:0.85rem">None</span>';

    document.getElementById('infoModalContent').innerHTML = `
      <h2 class="modal-title">/${escHtml(cmd.name)}</h2>
      <div class="modal-field">
        <div class="modal-field-label">Description</div>
        <div style="font-size:0.9rem;color:var(--text-2);line-height:1.6">${escHtml(cmd.description)}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Usage</div>
        <div class="modal-field-value">${escHtml(cmd.usage)}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Prefix Aliases</div>
        <div class="modal-aliases">${aliasHtml}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Category</div>
        <div style="font-size:0.88rem;color:var(--text-2)">${escHtml(cmd.category)}</div>
      </div>
    `;

    openModal('infoModalBackdrop');
  }

  /* ------------------------------------------------------------------ */
  /*  Settings panel                                                      */
  /* ------------------------------------------------------------------ */
  async function openSettingsPanel(cmd) {
    activeSettingsCmd = cmd;
    document.getElementById('settingsPanelTitle').textContent = `/${cmd.name} Settings`;
    document.getElementById('settingsPanelBody').innerHTML =
      '<div class="commands-loading"><div class="spinner"></div></div>';
    openPanel();

    // Lazy-load roles, channels, and global prefix config all at once
    try {
      [guildRoles, guildChannels, guildConfig] = await Promise.all([
        guildRoles    ?? apiFetch(`/guild/${GUILD_ID}/roles`).then((d) => { guildRoles = d; return d; }),
        guildChannels ?? apiFetch(`/guild/${GUILD_ID}/channels`).then((d) => { guildChannels = d; return d; }),
        guildConfig   ?? apiFetch(`/guild/${GUILD_ID}/config`).then((d) => { guildConfig = d; return d; }),
      ]);
    } catch (_) {
      guildRoles    = guildRoles    || [];
      guildChannels = guildChannels || [];
      guildConfig   = guildConfig   || { prefixEnabled: false, prefixes: [] };
    }

    renderSettingsPanel(cmd);
  }

  function renderSettingsPanel(cmd) {
    const s = cmd.settings;
    const body = document.getElementById('settingsPanelBody');
    const prefixOn = !!(guildConfig && guildConfig.prefixEnabled);
    const prefixes = (guildConfig && guildConfig.prefixes) || [];

    // Build 5 prefix input fields
    const placeholders = ['e.g. !', 'e.g. ?', 'Prefix 3', 'Prefix 4', 'Prefix 5'];
    const prefixFields = placeholders.map((ph, i) =>
      `<input type="text" class="sp-prefix-field prefix-field" maxlength="10" placeholder="${escHtml(ph)}" value="${escHtml(prefixes[i] || '')}">`
    ).join('');

    body.innerHTML = `
      <!-- Custom Description -->
      <div class="settings-field">
        <label class="settings-label" for="sp-desc">Custom Description</label>
        <div class="settings-hint">Overrides the description shown in Discord's command picker.</div>
        <textarea class="settings-textarea" id="sp-desc" placeholder="${escHtml(cmd.description)}" maxlength="100">${escHtml(s.customDescription)}</textarea>
      </div>

      <!-- Reply Visibility -->
      <div class="settings-field">
        <label class="settings-label" for="sp-ephemeral">Reply Visibility</label>
        <div class="settings-hint">Control whether replies are visible only to the user or to the channel.</div>
        <select class="settings-select" id="sp-ephemeral">
          <option value="default" ${s.ephemeralMode === 'default' ? 'selected' : ''}>Default (bot decides)</option>
          <option value="all"     ${s.ephemeralMode === 'all'     ? 'selected' : ''}>Always Ephemeral (private)</option>
          <option value="off"     ${s.ephemeralMode === 'off'     ? 'selected' : ''}>Always Public</option>
        </select>
      </div>

      <!-- Allowed Roles -->
      <div class="settings-field">
        <div class="settings-label">Allowed Roles</div>
        <div class="settings-hint">Leave empty for @everyone. Select roles to restrict access.</div>
        <div class="chips-select-wrap" id="rolesWrap">
          ${buildChipsUI('roles', guildRoles, s.allowedRoles)}
        </div>
      </div>

      <!-- Allowed Channels -->
      <div class="settings-field">
        <div class="settings-label">Allowed Channels</div>
        <div class="settings-hint">Leave empty for all channels. Select channels to restrict where this runs.</div>
        <div class="chips-select-wrap" id="channelsWrap">
          ${buildChipsUI('channels', guildChannels, s.allowedChannels)}
        </div>
      </div>

      <!-- Prefix Settings -->
      <div class="settings-field">
        <div class="settings-label" style="margin-bottom:12px">Prefix Commands</div>

        <!-- Server-wide toggle -->
        <div class="settings-toggle-row" style="margin-bottom:14px">
          <div>
            <div style="font-size:0.84rem;font-weight:600;color:var(--text-2)">Enable prefix commands server-wide</div>
            <div class="settings-hint">Allow members to run commands with a text prefix on this server.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="sp-global-prefix" ${prefixOn ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>

        <!-- Server prefix inputs (hidden when global off) -->
        <div id="sp-prefix-inputs" ${prefixOn ? '' : 'style="display:none"'}>
          <div class="settings-hint" style="margin-bottom:8px">Server prefixes (up to 5, max 10 chars each):</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
            ${prefixFields}
          </div>
        </div>

        <!-- Per-command prefix toggle (dimmed when global off) -->
        <div id="sp-cmd-prefix-row" class="settings-toggle-row" ${prefixOn ? '' : 'style="opacity:0.4;pointer-events:none"'}>
          <div>
            <div style="font-size:0.84rem;font-weight:600;color:var(--text-2)">Enable prefix for /${escHtml(cmd.name)}</div>
            <div class="settings-hint">Allow this specific command to be triggered via prefix.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="sp-cmd-prefix" ${s.prefixEnabled !== false ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-save-row">
        <button class="btn btn-primary btn-sm" id="sp-save">Save Changes</button>
        <button class="btn btn-ghost btn-sm" id="sp-cancel">Cancel</button>
      </div>
    `;

    // Wire global prefix toggle → show/hide inputs + dim per-command row
    const globalCheck  = document.getElementById('sp-global-prefix');
    const prefixInputs = document.getElementById('sp-prefix-inputs');
    const cmdPrefixRow = document.getElementById('sp-cmd-prefix-row');

    globalCheck.addEventListener('change', () => {
      prefixInputs.style.display       = globalCheck.checked ? '' : 'none';
      cmdPrefixRow.style.opacity       = globalCheck.checked ? '1' : '0.4';
      cmdPrefixRow.style.pointerEvents = globalCheck.checked ? ''  : 'none';
    });

    bindChipsUI('roles',    guildRoles,    s.allowedRoles,    body);
    bindChipsUI('channels', guildChannels, s.allowedChannels, body);

    document.getElementById('sp-save').addEventListener('click', () => saveSettings(cmd, body));
    document.getElementById('sp-cancel').addEventListener('click', closePanel);
  }

  async function saveSettings(cmd, body) {
    const saveBtn = document.getElementById('sp-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    const globalPrefixEnabled = document.getElementById('sp-global-prefix').checked;
    const prefixes = [...body.querySelectorAll('.sp-prefix-field')]
      .map((f) => f.value.trim())
      .filter(Boolean);

    const cmdPayload = {
      customDescription: document.getElementById('sp-desc').value.trim(),
      ephemeralMode:     document.getElementById('sp-ephemeral').value,
      prefixEnabled:     document.getElementById('sp-cmd-prefix').checked,
      allowedRoles:      getChipsValue(body, 'roles'),
      allowedChannels:   getChipsValue(body, 'channels'),
    };

    try {
      await Promise.all([
        apiFetch(`/guild/${GUILD_ID}/commands/${cmd.name}`, {
          method: 'PATCH',
          body: JSON.stringify(cmdPayload),
        }),
        apiFetch(`/guild/${GUILD_ID}/config`, {
          method: 'PATCH',
          body: JSON.stringify({ prefixEnabled: globalPrefixEnabled, prefixes }),
        }),
      ]);

      // Update local state
      Object.assign(cmd.settings, cmdPayload);
      guildConfig = { prefixEnabled: globalPrefixEnabled, prefixes };

      // Refresh the row description live
      const descEl = document.querySelector(`.cmd-row[data-name="${cmd.name}"] .cmd-row-desc`);
      if (descEl) descEl.textContent = cmdPayload.customDescription || cmd.description;

      toast('Settings saved', 'success');
      closePanel();
    } catch (err) {
      toast(`Failed: ${err.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Chips (multi-select) UI                                             */
  /* ------------------------------------------------------------------ */
  function buildChipsUI(type, items, selected) {
    if (!items?.length) return '<div style="font-size:0.82rem;color:var(--text-3)">No items available</div>';

    const selectedSet = new Set(selected || []);
    const chips = [...selectedSet].map((id) => {
      const item = items.find((i) => i.id === id);
      if (!item) return '';
      return `<span class="chip" data-id="${id}">${escHtml(item.name)}<button class="chip-remove" data-type="${type}" data-id="${id}">&#x2715;</button></span>`;
    }).join('');

    return `<div class="chips-container" id="chips-${type}" data-type="${type}">
      ${chips}
      <input type="text" class="chips-input" id="chips-input-${type}" placeholder="Search and add…"
        style="background:none;border:none;outline:none;color:var(--text);font-size:0.85rem;min-width:90px;font-family:inherit;">
    </div>`;
  }

  function bindChipsUI(type, items, selected, container) {
    if (!items?.length) return;
    const selectedSet = new Set(selected || []);
    const chipsContainer = container.querySelector(`#chips-${type}`);
    const input = container.querySelector(`#chips-input-${type}`);
    if (!chipsContainer || !input) return;

    let dropdownEl = null;

    function renderChipsDropdown() {
      if (dropdownEl) { dropdownEl.remove(); dropdownEl = null; }
      const term = input.value.toLowerCase();
      const filtered = items.filter((item) => !selectedSet.has(item.id) && item.name.toLowerCase().includes(term));
      if (!filtered.length) return;

      dropdownEl = document.createElement('div');
      dropdownEl.className = 'chips-dropdown';

      filtered.slice(0, 20).forEach((item) => {
        const el = document.createElement('div');
        el.className = 'chips-dropdown-item';
        el.textContent = item.name;
        el.addEventListener('mousedown', (e) => {
          e.preventDefault();
          if (selectedSet.has(item.id)) return;
          selectedSet.add(item.id);
          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.dataset.id = item.id;
          chip.innerHTML = `${escHtml(item.name)}<button class="chip-remove" data-type="${type}" data-id="${item.id}">&#x2715;</button>`;
          chipsContainer.insertBefore(chip, input);
          input.value = '';
          if (dropdownEl) { dropdownEl.remove(); dropdownEl = null; }
        });
        dropdownEl.appendChild(el);
      });

      chipsContainer.parentElement.appendChild(dropdownEl);
    }

    input.addEventListener('input',  renderChipsDropdown);
    input.addEventListener('focus',  renderChipsDropdown);
    input.addEventListener('blur',   () => setTimeout(() => { if (dropdownEl) { dropdownEl.remove(); dropdownEl = null; } }, 200));

    chipsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-remove');
      if (btn) { selectedSet.delete(btn.dataset.id); btn.closest('.chip').remove(); }
    });
  }

  function getChipsValue(body, type) {
    const container = body.querySelector(`#chips-${type}`);
    if (!container) return [];
    return [...container.querySelectorAll('.chip[data-id]')].map((c) => c.dataset.id);
  }

  /* ------------------------------------------------------------------ */
  /*  Category tabs & search                                              */
  /* ------------------------------------------------------------------ */
  function bindCategoryTabs() {
    document.getElementById('categoryTabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.cat-tab');
      if (!tab) return;
      document.querySelectorAll('.cat-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.cat;
      renderCommands();
    });
  }

  function bindSearch() {
    document.getElementById('commandSearch').addEventListener('input', (e) => {
      searchTerm = e.target.value;
      renderCommands();
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Modal helpers                                                       */
  /* ------------------------------------------------------------------ */
  function openModal(id) {
    const el = document.getElementById(id);
    el.setAttribute('aria-hidden', 'false');
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    el.setAttribute('aria-hidden', 'true');
    el.classList.remove('open');
    document.body.style.overflow = '';
  }

  function bindModalClose() {
    document.getElementById('infoModalClose').addEventListener('click', () => closeModal('infoModalBackdrop'));
    document.getElementById('infoModalBackdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal('infoModalBackdrop');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal('infoModalBackdrop');
        closePanel();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Panel helpers                                                       */
  /* ------------------------------------------------------------------ */
  function openPanel() {
    document.getElementById('settingsPanel').classList.add('open');
    document.getElementById('settingsBackdrop').classList.add('open');
    document.getElementById('settingsBackdrop').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closePanel() {
    document.getElementById('settingsPanel').classList.remove('open');
    document.getElementById('settingsBackdrop').classList.remove('open');
    document.getElementById('settingsBackdrop').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    activeSettingsCmd = null;
  }

  function bindPanelClose() {
    document.getElementById('settingsPanelClose').addEventListener('click', closePanel);
    document.getElementById('settingsBackdrop').addEventListener('click', closePanel);
  }

  /* ------------------------------------------------------------------ */
  /*  Toast notifications                                                 */
  /* ------------------------------------------------------------------ */
  let toastEl = null;
  let toastTimer = null;

  function toast(msg, type = 'success') {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }

    clearTimeout(toastTimer);
    toastEl.className = `toast ${type}`;
    toastEl.textContent = type === 'success' ? `✓  ${msg}` : `✕  ${msg}`;
    toastEl.classList.add('show');

    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  /* ------------------------------------------------------------------ */
  /*  Utility                                                             */
  /* ------------------------------------------------------------------ */
  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();

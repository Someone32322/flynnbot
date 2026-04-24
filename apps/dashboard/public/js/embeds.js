/**
 * embeds.js — Dashboard client for the Embed Templates section.
 * Loaded on server.ejs. Initialises when the #section-embeds becomes active.
 */

(function () {
  'use strict';

  const SAPPHIRE = 0x0f52ba;

  // ── State ────────────────────────────────────────────────────
  let guildId = null;
  let allEmbeds = [];
  let editingEmbedId = null; // null = creating new
  let initialized = false;

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

  // ── Init ─────────────────────────────────────────────────────
  function initEmbeds() {
    if (initialized) return;
    initialized = true;

    const pageData = document.getElementById('pageData');
    guildId = pageData ? pageData.dataset.guildId : null;
    if (!guildId) return;

    bindUI();
    loadEmbeds();
  }

  // ── Bind static UI events ────────────────────────────────────
  function bindUI() {
    document.getElementById('embedNewBtn').addEventListener('click', () => openEditor(null));
    document.getElementById('embedEditorClose').addEventListener('click', closeEditor);
    document.getElementById('embedEditorCancel').addEventListener('click', closeEditor);
    document.getElementById('embedEditorSave').addEventListener('click', saveEmbed);
    document.getElementById('embedAddField').addEventListener('click', addFieldRow);

    // Delegated listener for edit/delete buttons on embed cards
    document.getElementById('embedsList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'edit') {
        const emb = allEmbeds.find((em) => em._id === id);
        if (emb) openEditor(emb);
      } else if (btn.dataset.action === 'delete') {
        deleteEmbed(id);
      }
    });

    // Live preview on any input change
    ['embedTitle', 'embedDescription', 'embedAuthor', 'embedFooter', 'embedColorPicker', 'embedImageUrl', 'embedThumbnailUrl'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updatePreview);
    });

    // Close backdrop click
    document.getElementById('embedEditorBackdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeEditor();
    });
  }

  // ── Load embeds ──────────────────────────────────────────────
  async function loadEmbeds() {
    const container = document.getElementById('embedsList');
    if (!container) return;
    container.innerHTML = '<div class="commands-loading"><div class="spinner"></div>Loading embeds…</div>';

    try {
      const res = await fetch(`/api/guild/${guildId}/embeds`);
      if (!res.ok) throw new Error('Failed to load embeds');
      allEmbeds = await res.json();
      renderEmbedList();
    } catch (err) {
      container.innerHTML = `<p class="error-text">${escHtml(err.message)}</p>`;
    }
  }

  function renderEmbedList() {
    const container = document.getElementById('embedsList');
    if (!container) return;

    if (allEmbeds.length === 0) {
      container.innerHTML = '<p class="empty-state">No embed templates yet. Click "+ New Embed" to create one.</p>';
      return;
    }

    container.innerHTML = allEmbeds.map((emb) => {
      const colorHex = hexFromInt(emb.color);
      const preview = emb.description ? emb.description.substring(0, 80) + (emb.description.length > 80 ? '…' : '') : '<em>No description</em>';
      return `
        <div class="embed-card" data-id="${escHtml(emb._id)}">
          <div class="embed-card-bar" style="background:${escHtml(colorHex)}"></div>
          <div class="embed-card-body">
            <div class="embed-card-name">${escHtml(emb.name)}</div>
            <div class="embed-card-title">${emb.title ? escHtml(emb.title) : '<span class="muted">No title</span>'}</div>
            <div class="embed-card-desc">${preview}</div>
          </div>
          <div class="embed-card-actions">
            <button class="btn btn-sm" data-action="edit" data-id="${escHtml(emb._id)}">Edit</button>
            <button class="btn btn-sm btn-danger" data-action="delete" data-id="${escHtml(emb._id)}">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Editor open/close ────────────────────────────────────────
  function openEditor(embed) {
    editingEmbedId = embed ? embed._id : null;

    document.getElementById('embedEditorTitle').textContent = embed ? 'Edit Embed' : 'New Embed';
    document.getElementById('embedName').value = embed?.name ?? '';
    document.getElementById('embedName').disabled = !!embed; // name immutable after create
    document.getElementById('embedTitle').value = embed?.title ?? '';
    document.getElementById('embedDescription').value = embed?.description ?? '';
    document.getElementById('embedAuthor').value = embed?.author ?? '';
    document.getElementById('embedFooter').value = embed?.footer ?? '';
    document.getElementById('embedColorPicker').value = hexFromInt(embed?.color);
    document.getElementById('embedImageUrl').value = embed?.imageUrl ?? '';
    document.getElementById('embedThumbnailUrl').value = embed?.thumbnailUrl ?? '';

    // Fields
    const fieldsList = document.getElementById('embedFieldsList');
    fieldsList.innerHTML = '';
    (embed?.fields ?? []).forEach((f) => addFieldRow(f));

    updatePreview();

    const backdrop = document.getElementById('embedEditorBackdrop');
    backdrop.setAttribute('aria-hidden', 'false');
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeEditor() {
    const backdrop = document.getElementById('embedEditorBackdrop');
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
    editingEmbedId = null;
  }

  // ── Dynamic fields ───────────────────────────────────────────
  function addFieldRow(field) {
    const row = document.createElement('div');
    row.className = 'embed-field-row';
    row.innerHTML = `
      <input type="text" class="field-name" placeholder="Field name" maxlength="256" value="${escHtml(field?.name ?? '')}" />
      <textarea class="field-value" rows="2" placeholder="Field value" maxlength="1024">${escHtml(field?.value ?? '')}</textarea>
      <label class="field-inline-label">
        <input type="checkbox" class="field-inline" ${field?.inline ? 'checked' : ''} /> Inline
      </label>
      <button type="button" class="btn btn-sm btn-danger field-remove">✕</button>
    `;
    row.querySelector('.field-remove').addEventListener('click', () => { row.remove(); updatePreview(); });
    row.querySelectorAll('input, textarea').forEach((el) => el.addEventListener('input', updatePreview));
    document.getElementById('embedFieldsList').appendChild(row);
    updatePreview();
  }

  // ── Live preview ─────────────────────────────────────────────
  function updatePreview() {
    const title = document.getElementById('embedTitle').value.trim();
    const description = document.getElementById('embedDescription').value.trim();
    const author = document.getElementById('embedAuthor').value.trim();
    const footer = document.getElementById('embedFooter').value.trim();
    const color = document.getElementById('embedColorPicker').value;
    const imageUrl = document.getElementById('embedImageUrl').value.trim();
    const thumbnailUrl = document.getElementById('embedThumbnailUrl').value.trim();

    setPreviewEl('depColorBar', null, { background: color }, true);
    setPreviewEl('depTitle', title);
    setPreviewEl('depDescription', description);
    setPreviewEl('depAuthor', author);
    setPreviewEl('depFooter', footer);

    // Image
    const depImage = document.getElementById('depImage');
    const depImageImg = document.getElementById('depImageImg');
    if (imageUrl) { depImageImg.src = imageUrl; depImage.style.display = ''; }
    else depImage.style.display = 'none';

    // Thumbnail
    const depThumb = document.getElementById('depThumbnail');
    const depThumbImg = document.getElementById('depThumbnailImg');
    if (thumbnailUrl) { depThumbImg.src = thumbnailUrl; depThumb.style.display = ''; }
    else depThumb.style.display = 'none';

    // Fields
    const depFields = document.getElementById('depFields');
    const fieldRows = document.querySelectorAll('.embed-field-row');
    if (fieldRows.length) {
      depFields.innerHTML = Array.from(fieldRows).map((row) => {
        const n = row.querySelector('.field-name').value.trim();
        const v = row.querySelector('.field-value').value.trim();
        if (!n && !v) return '';
        return `<div class="dep-field"><div class="dep-field-name">${escHtml(n)}</div><div class="dep-field-value">${escHtml(v)}</div></div>`;
      }).join('');
    } else {
      depFields.innerHTML = '';
    }
  }

  function setPreviewEl(id, text, style, forceShow) {
    const el = document.getElementById(id);
    if (!el) return;
    if (style) Object.assign(el.style, style);
    if (text !== null) {
      if (text) {
        el.textContent = text;
        el.style.display = '';
      } else if (!forceShow) {
        el.style.display = 'none';
      }
    }
  }

  // ── Save embed ───────────────────────────────────────────────
  async function saveEmbed() {
    const name = document.getElementById('embedName').value.trim();
    if (!name) { alert('Embed name is required.'); return; }

    const fields = Array.from(document.querySelectorAll('.embed-field-row')).map((row) => ({
      name: row.querySelector('.field-name').value.trim(),
      value: row.querySelector('.field-value').value.trim(),
      inline: row.querySelector('.field-inline').checked,
    })).filter((f) => f.name || f.value);

    const payload = {
      title: document.getElementById('embedTitle').value.trim() || undefined,
      description: document.getElementById('embedDescription').value.trim() || undefined,
      author: document.getElementById('embedAuthor').value.trim() || undefined,
      footer: document.getElementById('embedFooter').value.trim() || undefined,
      color: intFromHex(document.getElementById('embedColorPicker').value),
      imageUrl: document.getElementById('embedImageUrl').value.trim() || undefined,
      thumbnailUrl: document.getElementById('embedThumbnailUrl').value.trim() || undefined,
      fields,
    };

    const saveBtn = document.getElementById('embedEditorSave');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      let res;
      if (editingEmbedId) {
        res = await fetch(`/api/guild/${guildId}/embeds/${editingEmbedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/guild/${guildId}/embeds`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, ...payload }),
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? 'Failed to save embed');
      }

      closeEditor();
      await loadEmbeds();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Embed';
    }
  }

  // ── Delete embed ─────────────────────────────────────────────
  async function deleteEmbed(embedId) {
    const emb = allEmbeds.find((e) => e._id === embedId);
    if (!emb) return;
    if (!confirm(`Delete embed "${emb.name}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/guild/${guildId}/embeds/${embedId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete embed');
      await loadEmbeds();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  // ── Hook into section navigation ─────────────────────────────
  document.addEventListener('sectionActivated', (e) => {
    if (e.detail?.section === 'embeds') initEmbeds();
  });
})();

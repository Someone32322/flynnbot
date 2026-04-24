/**
 * modconfig.js — Dashboard client for the Moderation Settings section.
 * Loaded on server.ejs. Initialises when #section-moderation becomes active.
 */
(function () {
  'use strict';

  let guildId = null;
  let initialized = false;

  function initModConfig() {
    if (initialized) return;
    initialized = true;
    const pageData = document.getElementById('pageData');
    guildId = pageData?.dataset?.guildId;
    if (!guildId) return;
    loadModConfig();
    document.getElementById('modSaveBtn').addEventListener('click', saveModConfig);
  }

  async function loadModConfig() {
    try {
      const [configRes, rolesRes, chRes] = await Promise.all([
        fetch(`/api/guild/${guildId}/modconfig`),
        fetch(`/api/guild/${guildId}/roles`),
        fetch(`/api/guild/${guildId}/channels`),
      ]);

      const config = await configRes.json();
      const roles = await rolesRes.json();
      const channels = (await chRes.json()).filter((c) => [0, 5].includes(c.type));

      // Populate mod role selector
      const roleSel = document.getElementById('modRoleSelect');
      roleSel.innerHTML = '<option value="">None (disable moderator role check)</option>' +
        roles.map((r) => `<option value="${r.id}" ${config.moderatorRoleId === r.id ? 'selected' : ''}>${escHtml(r.name)}</option>`).join('');

      // Populate audit log channel selector
      const chanSel = document.getElementById('modAuditSelect');
      chanSel.innerHTML = '<option value="">None (disable audit logging)</option>' +
        channels.map((c) => `<option value="${c.id}" ${config.auditLogChannelId === c.id ? 'selected' : ''}>#${escHtml(c.name)}</option>`).join('');
    } catch (err) {
      const status = document.getElementById('modSaveStatus');
      if (status) { status.textContent = 'Failed to load settings.'; status.className = 'save-status error'; }
    }
  }

  async function saveModConfig() {
    const saveBtn = document.getElementById('modSaveBtn');
    const status = document.getElementById('modSaveStatus');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    if (status) { status.textContent = ''; status.className = 'save-status'; }

    const moderatorRoleId = document.getElementById('modRoleSelect').value || null;
    const auditLogChannelId = document.getElementById('modAuditSelect').value || null;

    try {
      const res = await fetch(`/api/guild/${guildId}/modconfig`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moderatorRoleId, auditLogChannelId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save');
      if (status) { status.textContent = '✓ Saved'; status.className = 'save-status success'; }
      setTimeout(() => { if (status) status.textContent = ''; }, 3000);
    } catch (err) {
      if (status) { status.textContent = 'Error: ' + err.message; status.className = 'save-status error'; }
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Settings';
    }
  }

  function escHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  document.addEventListener('sectionActivated', (e) => {
    if (e.detail?.section === 'moderation') initModConfig();
  });
})();

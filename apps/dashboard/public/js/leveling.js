/**
 * leveling.js — Dashboard leveling section logic
 * Handles config load/save, leaderboard, and role rewards.
 */
(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────
  let guildId = null;
  let channels = [];   // [{id, name, type}] populated from page data
  let roles = [];      // [{id, name, color}]
  let rewards = [];    // [{level, roleId}] working copy
  let lbPage = 1;
  let lbTotalPages = 1;
  let dirty = false;

  // ── Element helpers ───────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  function markDirty() {
    dirty = true;
    const bar = $('lvSaveBar');
    if (bar) bar.style.display = 'flex';
  }

  function showStatus(msg, ok = true) {
    const el = $('lvSaveStatus');
    if (!el) return;
    el.textContent = msg;
    el.style.color = ok ? '#4ade80' : '#f87171';
    setTimeout(() => { el.textContent = ''; }, 3000);
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    const pageData = document.getElementById('pageData');
    guildId = pageData ? pageData.dataset.guildId : null;
    if (!guildId) return;

    // Grab channel + role data injected by server.ejs
    try {
      const raw = document.getElementById('guildData');
      if (raw) {
        const parsed = JSON.parse(raw.textContent || '{}');
        channels = parsed.channels || [];
        roles = parsed.roles || [];
      }
    } catch (_) {}

    // Wire save/reset
    const saveBtn = $('lvSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveConfig);
    const resetBtn = $('lvResetBtn');
    if (resetBtn) resetBtn.addEventListener('click', confirmReset);

    // Wire add-reward modal
    $('lvAddRewardBtn')?.addEventListener('click', openRewardModal);
    $('lvRewardClose')?.addEventListener('click', closeRewardModal);
    $('lvRewardCancel')?.addEventListener('click', closeRewardModal);
    $('lvRewardConfirm')?.addEventListener('click', addRewardFromModal);
    $('lvRewardBackdrop')?.addEventListener('click', (e) => {
      if (e.target === $('lvRewardBackdrop')) closeRewardModal();
    });

    // Populate reward role selector
    populateRoleSelector();

    // Mark dirty on any input change
    ['lvEnabled', 'lvXpRate', 'lvXpCooldown', 'lvLevelUpMessage',
      'lvLevelUpChannel', 'lvRoleStack', 'lvFormulaA', 'lvFormulaB', 'lvFormulaC']
      .forEach((id) => {
        const el = $(id);
        if (el) el.addEventListener('change', markDirty);
        if (el && el.tagName === 'TEXTAREA') el.addEventListener('input', markDirty);
      });

    // Watch for section activation via sidebar
    const section = document.getElementById('section-levels');
    if (section) {
      const observer = new MutationObserver(() => {
        if (section.style.display !== 'none') {
          observer.disconnect();
          loadConfig();
        }
      });
      observer.observe(section, { attributes: true, attributeFilter: ['style'] });
      // also load immediately if already visible
      if (section.style.display !== 'none') loadConfig();
    }
  }

  // ── Load config ───────────────────────────────────────────
  async function loadConfig() {
    try {
      const res = await fetch(`/api/guild/${guildId}/levels`);
      if (!res.ok) throw new Error(await res.text());
      const cfg = await res.json();
      applyConfig(cfg);
      loadLeaderboard(1);
    } catch (err) {
      console.error('[leveling] loadConfig', err);
    }
  }

  function applyConfig(cfg) {
    const enabled = $('lvEnabled');
    if (enabled) {
      enabled.checked = cfg.enabled !== false;
      const content = $('lvContent');
      if (content) content.style.display = cfg.enabled !== false ? '' : 'none';
      enabled.addEventListener('change', function () {
        const c = $('lvContent');
        if (c) c.style.display = this.checked ? '' : 'none';
        markDirty();
      }, { once: false });
    }

    setVal('lvXpRate', cfg.xpRate ?? 15);
    setVal('lvXpCooldown', cfg.xpCooldown ?? 60);
    setVal('lvLevelUpMessage', cfg.levelUpMessage ?? '');
    setVal('lvFormulaA', cfg.formula?.a ?? 5);
    setVal('lvFormulaB', cfg.formula?.b ?? 50);
    setVal('lvFormulaC', cfg.formula?.c ?? 100);

    const roleStack = $('lvRoleStack');
    if (roleStack) roleStack.checked = cfg.roleStack !== false;

    populateChannelSelector(cfg.xpChannels || []);
    populateLevelUpChannelSelector(cfg.levelUpChannelId || '');

    rewards = (cfg.rewards || []).map((r) => ({ level: r.level, roleId: r.roleId }));
    renderRewards();

    dirty = false;
    const bar = $('lvSaveBar');
    if (bar) bar.style.display = 'none';
  }

  function setVal(id, val) {
    const el = $(id);
    if (!el) return;
    if (el.tagName === 'TEXTAREA' || el.type === 'text') el.value = val;
    else el.value = val;
  }

  // ── Channel selectors ─────────────────────────────────────
  function populateChannelSelector(selected) {
    const wrap = $('lvChannelsSelect');
    if (!wrap) return;
    wrap.innerHTML = '';
    const textChannels = channels.filter((c) => c.type === 0 || c.type === 'text');
    if (!textChannels.length) {
      wrap.innerHTML = '<span class="lv-hint">No text channels found.</span>';
      return;
    }
    textChannels.forEach((ch) => {
      const chip = document.createElement('div');
      chip.className = 'lv-channel-chip' + (selected.includes(ch.id) ? ' active' : '');
      chip.dataset.id = ch.id;
      chip.innerHTML = `<span class="lv-chip-icon">#</span>${escHtml(ch.name)}`;
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        markDirty();
      });
      wrap.appendChild(chip);
    });
  }

  function populateLevelUpChannelSelector(currentId) {
    const sel = $('lvLevelUpChannel');
    if (!sel) return;
    sel.innerHTML = '<option value="">Same channel as message</option>';
    const textChannels = channels.filter((c) => c.type === 0 || c.type === 'text');
    textChannels.forEach((ch) => {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.textContent = `#${ch.name}`;
      if (ch.id === currentId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // ── Rewards ───────────────────────────────────────────────
  function populateRoleSelector() {
    const sel = $('lvRewardRole');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select a role…</option>';
    roles.forEach((r) => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      sel.appendChild(opt);
    });
  }

  function renderRewards() {
    const list = $('lvRewardsList');
    const empty = $('lvRewardsEmpty');
    if (!list) return;
    list.innerHTML = '';
    if (!rewards.length) {
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    [...rewards].sort((a, b) => a.level - b.level).forEach((r) => {
      const role = roles.find((x) => x.id === r.roleId);
      const row = document.createElement('div');
      row.className = 'lv-reward-row';
      row.innerHTML = `
        <span class="lv-reward-level">Level ${r.level}</span>
        <span class="lv-reward-role">${escHtml(role ? role.name : r.roleId)}</span>
        <button class="lv-reward-del" title="Remove" data-level="${r.level}" data-role="${escHtml(r.roleId)}">✕</button>`;
      row.querySelector('.lv-reward-del').addEventListener('click', (e) => {
        const { level, role: roleId } = e.currentTarget.dataset;
        rewards = rewards.filter((x) => !(x.level == level && x.roleId === roleId));
        renderRewards();
        markDirty();
      });
      list.appendChild(row);
    });
  }

  function openRewardModal() {
    const bd = $('lvRewardBackdrop');
    if (bd) { bd.style.display = 'flex'; bd.removeAttribute('aria-hidden'); }
    $('lvRewardLevel')?.focus();
  }

  function closeRewardModal() {
    const bd = $('lvRewardBackdrop');
    if (bd) { bd.style.display = ''; bd.setAttribute('aria-hidden', 'true'); }
    if ($('lvRewardLevel')) $('lvRewardLevel').value = '';
    if ($('lvRewardRole')) $('lvRewardRole').value = '';
  }

  function addRewardFromModal() {
    const level = parseInt($('lvRewardLevel')?.value);
    const roleId = $('lvRewardRole')?.value;
    if (!level || level < 1 || !roleId) {
      alert('Please enter a valid level and select a role.');
      return;
    }
    // Remove any existing entry for this level
    rewards = rewards.filter((r) => r.level !== level);
    rewards.push({ level, roleId });
    rewards.sort((a, b) => a.level - b.level);
    renderRewards();
    markDirty();
    closeRewardModal();
  }

  // ── Save ──────────────────────────────────────────────────
  async function saveConfig() {
    const body = {
      enabled: $('lvEnabled')?.checked ?? true,
      xpRate: Number($('lvXpRate')?.value) || 15,
      xpCooldown: Number($('lvXpCooldown')?.value) ?? 60,
      levelUpMessage: $('lvLevelUpMessage')?.value || '',
      levelUpChannelId: $('lvLevelUpChannel')?.value || null,
      roleStack: $('lvRoleStack')?.checked ?? true,
      formula: {
        a: Number($('lvFormulaA')?.value) || 5,
        b: Number($('lvFormulaB')?.value) || 50,
        c: Number($('lvFormulaC')?.value) || 100,
      },
      rewards,
      xpChannels: [...($('lvChannelsSelect')?.querySelectorAll('.lv-channel-chip.active') || [])]
        .map((c) => c.dataset.id),
    };

    try {
      const res = await fetch(`/api/guild/${guildId}/levels`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        showStatus('Save failed: ' + (err.error || res.statusText), false);
        return;
      }
      dirty = false;
      const bar = $('lvSaveBar');
      if (bar) bar.style.display = 'none';
      showStatus('Saved!', true);
    } catch (err) {
      showStatus('Network error', false);
      console.error('[leveling] saveConfig', err);
    }
  }

  // ── Reset ─────────────────────────────────────────────────
  async function confirmReset() {
    if (!confirm('Are you sure you want to permanently delete ALL XP data for this server? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/guild/${guildId}/levels/reset`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      alert(`Deleted ${data.deleted} user records. Leaderboard has been reset.`);
      loadLeaderboard(1);
    } catch (err) {
      alert('Reset failed: ' + err.message);
    }
  }

  // ── Leaderboard ───────────────────────────────────────────
  async function loadLeaderboard(page) {
    lbPage = page;
    const wrap = $('lvLeaderboard');
    if (!wrap) return;
    wrap.innerHTML = '<div class="commands-loading"><div class="spinner"></div>Loading…</div>';

    try {
      const res = await fetch(`/api/guild/${guildId}/levels/leaderboard?page=${page}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      lbTotalPages = data.totalPages || 1;
      renderLeaderboard(data.rows, data.total);
      renderLbPagination();
    } catch (err) {
      wrap.innerHTML = `<p class="lv-hint" style="text-align:center">Failed to load leaderboard.</p>`;
      console.error('[leveling] loadLeaderboard', err);
    }
  }

  function renderLeaderboard(rows, total) {
    const wrap = $('lvLeaderboard');
    if (!wrap) return;
    if (!rows || !rows.length) {
      wrap.innerHTML = '<p class="lv-hint" style="text-align:center">No data yet.</p>';
      return;
    }
    const rankClass = (n) => n === 1 ? 'gold' : n === 2 ? 'silver' : n === 3 ? 'bronze' : '';
    wrap.innerHTML = `
      <table class="lv-lb-table">
        <thead>
          <tr>
            <th>#</th>
            <th>User ID</th>
            <th>Level</th>
            <th>XP</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td class="lv-lb-rank ${rankClass(r.rank)}">${r.rank}</td>
              <td class="lv-lb-userid">${escHtml(r.userId)}</td>
              <td class="lv-lb-level">${r.level}</td>
              <td class="lv-lb-xp">${r.xp.toLocaleString()}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="lv-hint" style="text-align:right;margin-top:0.4rem">${total} member${total !== 1 ? 's' : ''} total</div>`;
  }

  function renderLbPagination() {
    const wrap = $('lvLbPagination');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (lbTotalPages <= 1) return;
    for (let i = 1; i <= lbTotalPages; i++) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm' + (i === lbPage ? ' btn-primary' : ' btn-secondary');
      btn.textContent = i;
      btn.addEventListener('click', () => loadLeaderboard(i));
      wrap.appendChild(btn);
    }
  }

  // ── Home card stat ─────────────────────────────────────────
  async function loadHomeStats() {
    try {
      const res = await fetch(`/api/guild/${guildId}/levels`);
      if (!res.ok) return;
      const cfg = await res.json();
      const el = $('home-levels-stats');
      if (el) el.textContent = cfg.enabled ? `Enabled · ${cfg.rewards?.length || 0} reward${cfg.rewards?.length !== 1 ? 's' : ''}` : 'Disabled';
    } catch (_) {}
  }

  // ── Utilities ─────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Boot ──────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    init();
    loadHomeStats();
  });
})();

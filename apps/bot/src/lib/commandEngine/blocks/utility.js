'use strict';

/**
 * blocks/utility.js
 * Utility blocks: logging, formatting, HTTP GET (allowlisted), JSON parsing.
 */

// Allowlisted hostnames for HTTP GET — OWASP SSRF prevention
const HTTP_ALLOWLIST = new Set([
  'api.github.com',
  'api.openweathermap.org',
  'api.coindesk.com',
  'api.exchangerate-api.com',
  'api.exchangeratesapi.io',
  'api.coinpaprika.com',
  'api.tvmaze.com',
  'api.jikan.moe',
  'pokeapi.co',
  'swapi.dev',
  'api.publicapis.org',
  'jsonplaceholder.typicode.com',
  'api.quotable.io',
  'api.adviceslip.com',
  'uselessfacts.jsph.pl',
  'official-joke-api.appspot.com',
  'v2.jokeapi.dev',
]);

function isAllowedUrl(url) {
  try {
    const u = new URL(url);
    // Must be HTTPS
    if (u.protocol !== 'https:') return false;
    // Must be in allowlist
    if (!HTTP_ALLOWLIST.has(u.hostname)) return false;
    // Must not have SSRF-risk path components
    if (/localhost|127\.|::1|169\.254|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\./.test(url)) return false;
    return true;
  } catch {
    return false;
  }
}

// Safe nested JSON path resolution  (only plain property access, no eval)
function getJsonPath(obj, path) {
  if (!path || typeof path !== 'string') return obj;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    // Prototype pollution guard
    if (part === '__proto__' || part === 'constructor' || part === 'prototype') return undefined;
    if (typeof current !== 'object' && !Array.isArray(current)) return undefined;
    current = Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined;
  }
  return current;
}

/**
 * @param {import('../BlockRegistry').BlockRegistry} registry
 */
function register(registry) {

  // ── log ───────────────────────────────────────────────────────
  registry.register('log', {
    category: 'utility',
    label:    'Log',
    icon:     '📋',
    color:    '#b5bac1',
    schema: {
      message:   { type: 'text', label: 'Message', placeholder: 'User {user.id} ran command' },
      channelId: { type: 'text', label: 'Log to Channel ID (optional)' },
    },
    async execute(data, ctx) {
      const msg = ctx.resolve(String(data.message || '')).slice(0, 1000);
      if (!msg) return;

      console.log(`[CommandEngine:log] [${ctx.guildId}] ${msg}`);

      const chanId = ctx.resolve(String(data.channelId || '')).trim();
      if (chanId && ctx.guild) {
        const channel = ctx.guild.channels.cache.get(chanId) || await ctx.client.channels.fetch(chanId).catch(() => null);
        if (channel?.isTextBased?.()) {
          await channel.send({ content: msg }).catch(() => null);
        }
      }
    },
  });

  // ── format_number ─────────────────────────────────────────────
  registry.register('format_number', {
    category: 'utility',
    label:    'Format Number',
    icon:     '🔢',
    color:    '#b5bac1',
    schema: {
      value:      { type: 'text',   label: 'Number',         placeholder: '{myVar}' },
      decimals:   { type: 'number', label: 'Decimal Places', min: 0, max: 20 },
      locale:     { type: 'text',   label: 'Locale (optional, e.g. en-US)', placeholder: 'en-US' },
      result_var: { type: 'text',   label: 'Result Variable' },
    },
    async execute(data, ctx) {
      const resultVar = String(data.result_var || '').trim();
      if (!resultVar) return;
      const num      = parseFloat(ctx.resolve(String(data.value ?? '0')));
      const decimals = Math.min(20, Math.max(0, parseInt(data.decimals ?? 0)));
      const locale   = data.locale ? String(data.locale).trim() : 'en-US';
      let formatted;
      try {
        formatted = num.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      } catch {
        formatted = num.toFixed(decimals);
      }
      ctx.vars.set(resultVar, formatted);
    },
  });

  // ── format_date ───────────────────────────────────────────────
  registry.register('format_date', {
    category: 'utility',
    label:    'Format Date',
    icon:     '📅',
    color:    '#b5bac1',
    schema: {
      timestamp:  { type: 'text',   label: 'Timestamp (ms, s, or ISO string)',  placeholder: '{timestamp}' },
      format:     { type: 'select', label: 'Format', options: ['locale', 'date', 'time', 'datetime', 'relative', 'iso', 'discord'] },
      result_var: { type: 'text',   label: 'Result Variable' },
    },
    async execute(data, ctx) {
      const resultVar = String(data.result_var || '').trim();
      if (!resultVar) return;
      const raw = ctx.resolve(String(data.timestamp || String(Date.now())));
      let date;
      const n = Number(raw);
      if (!isNaN(n)) {
        // If it looks like seconds (reasonable epoch seconds: < 10B)
        date = new Date(n < 1e10 ? n * 1000 : n);
      } else {
        date = new Date(raw);
      }

      if (isNaN(date.getTime())) {
        ctx.vars.set(resultVar, 'Invalid Date');
        return;
      }

      let out;
      switch (data.format) {
        case 'date':     out = date.toDateString(); break;
        case 'time':     out = date.toTimeString().slice(0, 8); break;
        case 'datetime': out = date.toLocaleString(); break;
        case 'relative': {
          const diff = Date.now() - date.getTime();
          const abs = Math.abs(diff);
          const units = [['year', 31536e6], ['month', 2628e6], ['week', 604800000], ['day', 86400000], ['hour', 3600000], ['minute', 60000], ['second', 1000]];
          const [unit, ms] = units.find(([, m]) => abs >= m) || ['second', 1000];
          const n2 = Math.floor(abs / ms);
          const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
          out = rtf.format(diff < 0 ? n2 : -n2, unit);
          break;
        }
        case 'iso':     out = date.toISOString(); break;
        case 'discord': out = `<t:${Math.floor(date.getTime()/1000)}:F>`; break;
        default:        out = date.toLocaleString();
      }
      ctx.vars.set(resultVar, out);
    },
  });

  // ── http_get ──────────────────────────────────────────────────
  registry.register('http_get', {
    category: 'utility',
    label:    'HTTP GET',
    icon:     '🌐',
    color:    '#b5bac1',
    description: 'Fetch data from an allowlisted HTTPS API',
    schema: {
      url:        { type: 'text', label: 'URL (must be in allowlist)', placeholder: 'https://api.example.com/endpoint' },
      path:       { type: 'text', label: 'JSON Path (optional, e.g. data.items.0.title)', placeholder: 'result.value' },
      result_var: { type: 'text', label: 'Result Variable', placeholder: 'apiResult' },
      error_var:  { type: 'text', label: 'Error Variable (optional)', placeholder: 'apiError' },
    },
    async execute(data, ctx) {
      const resultVar = String(data.result_var || '').trim();
      const errorVar  = String(data.error_var  || '').trim();
      const url       = ctx.resolve(String(data.url || '')).trim();

      if (!url) return;

      if (!isAllowedUrl(url)) {
        const msg = `HTTP GET blocked: "${url}" is not in the allowlist`;
        console.warn(`[CommandEngine] ${msg}`);
        if (errorVar) ctx.vars.set(errorVar, msg);
        return;
      }

      try {
        const resp = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json', 'User-Agent': 'FlynnBot/3.0' },
          signal:  AbortSignal.timeout(5000),
        });

        if (!resp.ok) {
          const msg = `HTTP ${resp.status}`;
          if (errorVar) ctx.vars.set(errorVar, msg);
          if (resultVar) ctx.vars.set(resultVar, '');
          return;
        }

        const json = await resp.json();
        const path = ctx.resolve(String(data.path || '')).trim();
        const val  = path ? getJsonPath(json, path) : json;

        if (resultVar) {
          ctx.vars.set(resultVar, val !== undefined && val !== null ? String(typeof val === 'object' ? JSON.stringify(val) : val) : '');
        }
        if (errorVar) ctx.vars.set(errorVar, '');
      } catch (err) {
        const msg = err.name === 'TimeoutError' ? 'Request timed out' : String(err.message || 'Request failed').slice(0, 200);
        if (errorVar) ctx.vars.set(errorVar, msg);
        if (resultVar) ctx.vars.set(resultVar, '');
      }
    },
  });

  // ── parse_json ────────────────────────────────────────────────
  registry.register('parse_json', {
    category: 'utility',
    label:    'Parse JSON',
    icon:     '{ }',
    color:    '#b5bac1',
    schema: {
      input:      { type: 'text', label: 'JSON String',     placeholder: '{apiResult}' },
      path:       { type: 'text', label: 'JSON Path',       placeholder: 'data.title' },
      result_var: { type: 'text', label: 'Result Variable', placeholder: 'value' },
    },
    async execute(data, ctx) {
      const resultVar = String(data.result_var || '').trim();
      if (!resultVar) return;
      const input = ctx.resolve(String(data.input || ''));
      let obj;
      try { obj = JSON.parse(input); } catch { ctx.vars.set(resultVar, ''); return; }
      const path = ctx.resolve(String(data.path || '')).trim();
      const val  = path ? getJsonPath(obj, path) : obj;
      ctx.vars.set(resultVar, val !== undefined && val !== null ? (typeof val === 'object' ? JSON.stringify(val) : String(val)) : '');
    },
  });

  // ── send_webhook ──────────────────────────────────────────────
  registry.register('send_webhook', {
    category: 'utility',
    label:    'Send Webhook',
    icon:     '🔗',
    color:    '#b5bac1',
    description: 'Send a message to a Discord webhook URL',
    schema: {
      url:      { type: 'text',     label: 'Webhook URL' },
      content:  { type: 'textarea', label: 'Content' },
      username: { type: 'text',     label: 'Username Override (optional)' },
    },
    async execute(data, ctx) {
      const url = ctx.resolve(String(data.url || '')).trim();
      // Validate it's a Discord webhook
      if (!/^https:\/\/discord(app)?\.com\/api\/webhooks\/\d+\//.test(url)) return;
      const content  = ctx.resolve(String(data.content || '')).slice(0, 2000);
      const username = ctx.resolve(String(data.username || '')).trim() || undefined;
      const payload  = { content };
      if (username) payload.username = username;
      await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(5000),
      }).catch(() => null);
    },
  });
}

module.exports = { register, isAllowedUrl };

'use strict';

/**
 * blocks/stored.js
 * Stored variable (DB-backed) operation blocks.
 */

/**
 * @param {import('../BlockRegistry').BlockRegistry} registry
 */
function register(registry) {

  // ── stored_get ────────────────────────────────────────────────
  registry.register('stored_get', {
    category: 'stored',
    label:    'Get Stored Variable',
    icon:     '💾',
    color:    '#eb459e',
    schema: {
      ref:        { type: 'text', label: 'Variable Reference Name', placeholder: 'userPoints' },
      result_var: { type: 'text', label: 'Store Result In (flow variable)', placeholder: 'points' },
    },
    async execute(data, ctx) {
      const ref       = String(data.ref || '').trim();
      const resultVar = String(data.result_var || '').trim();
      if (!ref) return;
      const value = ctx.vars.getStored(ref);
      if (resultVar) ctx.vars.set(resultVar, value ?? '');
    },
  });

  // ── stored_set ────────────────────────────────────────────────
  registry.register('stored_set', {
    category: 'stored',
    label:    'Set Stored Variable',
    icon:     '💾',
    color:    '#eb459e',
    schema: {
      ref:   { type: 'text', label: 'Variable Reference Name' },
      value: { type: 'text', label: 'New Value' },
    },
    async execute(data, ctx) {
      const ref   = String(data.ref   || '').trim();
      const value = ctx.resolve(String(data.value ?? ''));
      if (!ref) return;
      ctx.vars.setStored(ref, value);
    },
  });

  // ── stored_add ────────────────────────────────────────────────
  registry.register('stored_add', {
    category: 'stored',
    label:    'Add to Stored Number',
    icon:     '➕',
    color:    '#eb459e',
    schema: {
      ref:        { type: 'text', label: 'Variable Reference Name' },
      amount:     { type: 'text', label: 'Amount', placeholder: '10' },
      result_var: { type: 'text', label: 'Store New Value In (optional)', placeholder: 'newPoints' },
    },
    async execute(data, ctx) {
      const ref    = String(data.ref || '').trim();
      if (!ref) return;
      const amount = parseFloat(ctx.resolve(String(data.amount ?? '1'))) || 0;
      const current = parseFloat(ctx.vars.getStored(ref) ?? 0) || 0;
      const newVal  = current + amount;
      ctx.vars.setStored(ref, newVal);
      const resultVar = String(data.result_var || '').trim();
      if (resultVar) ctx.vars.set(resultVar, newVal);
    },
  });

  // ── stored_subtract ───────────────────────────────────────────
  registry.register('stored_subtract', {
    category: 'stored',
    label:    'Subtract from Stored Number',
    icon:     '➖',
    color:    '#eb459e',
    schema: {
      ref:        { type: 'text', label: 'Variable Reference Name' },
      amount:     { type: 'text', label: 'Amount', placeholder: '5' },
      result_var: { type: 'text', label: 'Store New Value In (optional)' },
    },
    async execute(data, ctx) {
      const ref    = String(data.ref || '').trim();
      if (!ref) return;
      const amount  = parseFloat(ctx.resolve(String(data.amount ?? '1'))) || 0;
      const current = parseFloat(ctx.vars.getStored(ref) ?? 0) || 0;
      const newVal  = current - amount;
      ctx.vars.setStored(ref, newVal);
      const resultVar = String(data.result_var || '').trim();
      if (resultVar) ctx.vars.set(resultVar, newVal);
    },
  });

  // ── stored_delete ─────────────────────────────────────────────
  registry.register('stored_delete', {
    category: 'stored',
    label:    'Delete Stored Value',
    icon:     '🗑️',
    color:    '#eb459e',
    schema: {
      ref: { type: 'text', label: 'Variable Reference Name' },
    },
    async execute(data, ctx) {
      const ref = String(data.ref || '').trim();
      if (ref) ctx.vars.deleteStored(ref);
    },
  });

  // ── stored_push ───────────────────────────────────────────────
  registry.register('stored_push', {
    category: 'stored',
    label:    'Push to Collection',
    icon:     '📎',
    color:    '#eb459e',
    schema: {
      ref:   { type: 'text', label: 'Collection Reference Name' },
      value: { type: 'text', label: 'Item to Push' },
    },
    async execute(data, ctx) {
      const ref   = String(data.ref || '').trim();
      if (!ref) return;
      const value = ctx.resolve(String(data.value ?? ''));
      const raw   = ctx.vars.getStored(ref);
      let arr;
      try {
        arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
        if (!Array.isArray(arr)) arr = [];
      } catch { arr = []; }
      arr.push(value);
      ctx.vars.setStored(ref, arr);
    },
  });

  // ── stored_pop ────────────────────────────────────────────────
  registry.register('stored_pop', {
    category: 'stored',
    label:    'Pop from Collection',
    icon:     '📤',
    color:    '#eb459e',
    schema: {
      ref:        { type: 'text', label: 'Collection Reference Name' },
      result_var: { type: 'text', label: 'Store Popped Value In', placeholder: 'item' },
    },
    async execute(data, ctx) {
      const ref = String(data.ref || '').trim();
      if (!ref) return;
      const raw = ctx.vars.getStored(ref);
      let arr;
      try {
        arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
        if (!Array.isArray(arr)) arr = [];
      } catch { arr = []; }
      const popped = arr.pop();
      ctx.vars.setStored(ref, arr);
      const resultVar = String(data.result_var || '').trim();
      if (resultVar) ctx.vars.set(resultVar, popped ?? '');
    },
  });

  // ── stored_collection_remove ──────────────────────────────────
  registry.register('stored_collection_remove', {
    category: 'stored',
    label:    'Remove from Collection',
    icon:     '✂️',
    color:    '#eb459e',
    schema: {
      ref:   { type: 'text', label: 'Collection Reference Name' },
      value: { type: 'text', label: 'Value to Remove (or index if is_index is on)' },
      is_index: { type: 'toggle', label: 'Remove by Index' },
    },
    async execute(data, ctx) {
      const ref = String(data.ref || '').trim();
      if (!ref) return;
      const raw = ctx.vars.getStored(ref);
      let arr;
      try {
        arr = Array.isArray(raw) ? [...raw] : (typeof raw === 'string' ? JSON.parse(raw) : []);
        if (!Array.isArray(arr)) arr = [];
      } catch { arr = []; }

      const target = ctx.resolve(String(data.value ?? ''));
      if (data.is_index) {
        const idx = parseInt(target);
        if (!isNaN(idx) && idx >= 0 && idx < arr.length) arr.splice(idx, 1);
      } else {
        const idx = arr.indexOf(target);
        if (idx !== -1) arr.splice(idx, 1);
      }
      ctx.vars.setStored(ref, arr);
    },
  });

  // ── stored_get_object_prop ────────────────────────────────────
  registry.register('stored_get_object_prop', {
    category: 'stored',
    label:    'Get Object Property',
    icon:     '🔑',
    color:    '#eb459e',
    schema: {
      ref:        { type: 'text', label: 'Object Reference Name' },
      prop:       { type: 'text', label: 'Property Name', placeholder: 'score' },
      result_var: { type: 'text', label: 'Store Result In', placeholder: 'score' },
    },
    async execute(data, ctx) {
      const ref  = String(data.ref  || '').trim();
      const prop = ctx.resolve(String(data.prop || '')).trim();
      const resultVar = String(data.result_var || '').trim();
      if (!ref || !prop || !resultVar) return;

      // Prototype pollution prevention
      if (['__proto__', 'constructor', 'prototype'].includes(prop)) return;

      const raw = ctx.vars.getStored(ref);
      let obj;
      try {
        obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch { return; }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
      const val = Object.prototype.hasOwnProperty.call(obj, prop) ? obj[prop] : '';
      ctx.vars.set(resultVar, val ?? '');
    },
  });
}

module.exports = { register };

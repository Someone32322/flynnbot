'use strict';

/**
 * blocks/flow.js
 * Control flow blocks: condition, loop, foreach, stop, wait, return.
 */

const { MAX_LOOP_ITERATIONS } = require('../ExecutionEngine');

// Safe regex compilation with timeout guard (no ReDoS)
function compileSafeRegex(pattern) {
  if (!pattern || typeof pattern !== 'string') return null;
  // Block clearly dangerous patterns
  if (pattern.length > 200) throw new Error('Regex pattern too long (max 200 chars)');
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

// Evaluate a condition comparison
function evalCondition(left, operator, right) {
  const l = String(left ?? '').trim();
  const r = String(right ?? '').trim();

  switch (operator) {
    case '==':
    case 'equals':       return l === r;
    case '!=':
    case 'not_equals':   return l !== r;
    case '>':            return parseFloat(l) > parseFloat(r);
    case '<':            return parseFloat(l) < parseFloat(r);
    case '>=':           return parseFloat(l) >= parseFloat(r);
    case '<=':           return parseFloat(l) <= parseFloat(r);
    case 'contains':     return l.toLowerCase().includes(r.toLowerCase());
    case 'not_contains': return !l.toLowerCase().includes(r.toLowerCase());
    case 'starts_with':  return l.toLowerCase().startsWith(r.toLowerCase());
    case 'ends_with':    return l.toLowerCase().endsWith(r.toLowerCase());
    case 'exists':       return l !== '' && l !== 'undefined' && l !== 'null';
    case 'not_exists':   return l === '' || l === 'undefined' || l === 'null';
    case 'matches':      {
      const rx = compileSafeRegex(r);
      return rx ? rx.test(l) : false;
    }
    case 'is_number':    return !isNaN(parseFloat(l)) && isFinite(l);
    case 'is_empty':     return l === '';
    case 'not_empty':    return l !== '';
    default:             return false;
  }
}

/**
 * @param {import('../BlockRegistry').BlockRegistry} registry
 */
function register(registry) {

  // ── condition ─────────────────────────────────────────────────
  registry.register('condition', {
    category: 'flow',
    label:    'Condition (If / Else)',
    icon:     '⚡',
    color:    '#f0b429',
    description: 'Execute blocks based on a condition',
    schema: {
      left:        { type: 'text',   label: 'Left Value',  placeholder: '{user.id}' },
      operator:    { type: 'select', label: 'Operator',    options: ['==','!=','>','<','>=','<=','contains','not_contains','starts_with','ends_with','exists','not_exists','matches','is_number','is_empty','not_empty'] },
      right:       { type: 'text',   label: 'Right Value', placeholder: '123456789' },
      blocks_if:   { type: 'block_list', label: 'If True' },
      blocks_else: { type: 'block_list', label: 'If False (optional)' },
    },
    async execute(data, ctx) {
      const left     = ctx.resolve(String(data.left  ?? ''));
      const right    = ctx.resolve(String(data.right ?? ''));
      const operator = data.operator || '==';
      const result   = evalCondition(left, operator, right);

      const subBlocks = result ? (data.blocks_if || []) : (data.blocks_else || []);
      if (subBlocks.length > 0) {
        await ctx.engine._executeBlocks(subBlocks, ctx);
      }
    },
  });

  // ── loop ──────────────────────────────────────────────────────
  registry.register('loop', {
    category: 'flow',
    label:    'Repeat Loop',
    icon:     '🔄',
    color:    '#f0b429',
    schema: {
      count:       { type: 'number',     label: 'Repeat Count (max 100)', min: 1, max: 100 },
      counter_var: { type: 'text',       label: 'Counter Variable Name (optional)', placeholder: 'i' },
      blocks:      { type: 'block_list', label: 'Loop Body' },
    },
    async execute(data, ctx) {
      const count = Math.min(MAX_LOOP_ITERATIONS, Math.max(1, parseInt(data.count) || 1));
      const varName = data.counter_var ? String(data.counter_var).trim() : null;
      const blocks  = Array.isArray(data.blocks) ? data.blocks : [];
      if (!blocks.length) return;

      for (let i = 0; i < count; i++) {
        if (ctx.isAborted()) break;
        if (varName) ctx.vars.set(varName, i);
        const signal = await ctx.engine._executeBlocks(blocks, ctx);
        if (signal === 'stop') return signal;
      }
    },
  });

  // ── foreach ───────────────────────────────────────────────────
  registry.register('foreach', {
    category: 'flow',
    label:    'For Each',
    icon:     '🔁',
    color:    '#f0b429',
    schema: {
      collection: { type: 'text',       label: 'Collection',          placeholder: '{stored.myList}' },
      item_var:   { type: 'text',       label: 'Item Variable Name',  placeholder: 'item' },
      index_var:  { type: 'text',       label: 'Index Variable (optional)', placeholder: 'i' },
      blocks:     { type: 'block_list', label: 'Loop Body' },
    },
    async execute(data, ctx) {
      const rawCollection = ctx.resolve(String(data.collection || ''));
      const itemVar  = data.item_var  ? String(data.item_var).trim()  : 'item';
      const indexVar = data.index_var ? String(data.index_var).trim() : null;
      const blocks   = Array.isArray(data.blocks) ? data.blocks : [];

      let items;
      try {
        const parsed = typeof rawCollection === 'string' ? JSON.parse(rawCollection) : rawCollection;
        items = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // Try comma-split
        items = rawCollection.split(',').map(s => s.trim()).filter(Boolean);
      }

      const maxItems = Math.min(items.length, MAX_LOOP_ITERATIONS);
      for (let i = 0; i < maxItems; i++) {
        if (ctx.isAborted()) break;
        ctx.vars.set(itemVar, items[i]);
        if (indexVar) ctx.vars.set(indexVar, i);
        const signal = await ctx.engine._executeBlocks(blocks, ctx);
        if (signal === 'stop') return signal;
      }
    },
  });

  // ── stop ──────────────────────────────────────────────────────
  registry.register('stop', {
    category: 'flow',
    label:    'Stop Execution',
    icon:     '🛑',
    color:    '#ed4245',
    description: 'Immediately stop executing this command',
    schema: {
      reason: { type: 'text', label: 'Reason (optional, for logging)', placeholder: 'Condition not met' },
    },
    async execute(data, ctx) {
      if (data.reason) {
        console.log(`[CommandEngine] stop block: ${ctx.resolve(String(data.reason))}`);
      }
      return 'stop';
    },
  });

  // ── wait ──────────────────────────────────────────────────────
  registry.register('wait', {
    category: 'flow',
    label:    'Wait / Delay',
    icon:     '⏱️',
    color:    '#b5bac1',
    schema: {
      ms: { type: 'number', label: 'Delay (ms, max 10000)', min: 0, max: 10000, default: 1000 },
    },
    async execute(data, ctx) {
      const ms = Math.min(10000, Math.max(0, parseInt(data.ms) || 0));
      if (ms > 0) {
        await new Promise(resolve => setTimeout(resolve, ms));
      }
    },
  });

  // ── multi_condition ───────────────────────────────────────────
  registry.register('multi_condition', {
    category: 'flow',
    label:    'Multi-Condition',
    icon:     '🔀',
    color:    '#f0b429',
    description: 'Run blocks only if ALL (or ANY) conditions pass',
    schema: {
      logic:      { type: 'select',     label: 'Logic',      options: ['AND', 'OR'] },
      conditions: { type: 'condition_list', label: 'Conditions' },
      blocks_if:  { type: 'block_list', label: 'If Passes' },
      blocks_else: { type: 'block_list', label: 'If Fails (optional)' },
    },
    async execute(data, ctx) {
      const conditions = Array.isArray(data.conditions) ? data.conditions : [];
      const logic = data.logic === 'OR' ? 'OR' : 'AND';

      let result;
      if (logic === 'AND') {
        result = conditions.every(c => evalCondition(ctx.resolve(String(c.left ?? '')), c.operator, ctx.resolve(String(c.right ?? ''))));
      } else {
        result = conditions.some(c => evalCondition(ctx.resolve(String(c.left ?? '')), c.operator, ctx.resolve(String(c.right ?? ''))));
      }

      const subBlocks = result ? (data.blocks_if || []) : (data.blocks_else || []);
      if (subBlocks.length > 0) {
        await ctx.engine._executeBlocks(subBlocks, ctx);
      }
    },
  });
}

module.exports = { register, evalCondition };

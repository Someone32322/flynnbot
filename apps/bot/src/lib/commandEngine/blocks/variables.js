'use strict';

/**
 * blocks/variables.js
 * Flow variable manipulation blocks.
 */

/**
 * @param {import('../BlockRegistry').BlockRegistry} registry
 */
function register(registry) {

  // ── set_var ───────────────────────────────────────────────────
  registry.register('set_var', {
    category: 'variables',
    label:    'Set Variable',
    icon:     '📦',
    color:    '#57f287',
    description: 'Set a runtime variable',
    schema: {
      name:  { type: 'text', label: 'Variable Name', placeholder: 'myVar' },
      value: { type: 'text', label: 'Value',          placeholder: '{user.id}' },
    },
    async execute(data, ctx) {
      const name  = String(data.name  || '').trim();
      const value = ctx.resolve(String(data.value ?? ''));
      if (!name) return;
      ctx.vars.set(name, value);
    },
  });

  // ── delete_var ────────────────────────────────────────────────
  registry.register('delete_var', {
    category: 'variables',
    label:    'Delete Variable',
    icon:     '🗑️',
    color:    '#57f287',
    schema: {
      name: { type: 'text', label: 'Variable Name' },
    },
    async execute(data, ctx) {
      const name = String(data.name || '').trim();
      if (name) ctx.vars.delete(name);
    },
  });

  // ── math ──────────────────────────────────────────────────────
  registry.register('math', {
    category: 'variables',
    label:    'Math Operation',
    icon:     '🔢',
    color:    '#57f287',
    schema: {
      result_var: { type: 'text',   label: 'Result Variable', placeholder: 'result' },
      left:       { type: 'text',   label: 'Left Operand',    placeholder: '{myVar}' },
      operator:   { type: 'select', label: 'Operator',        options: ['+', '-', '*', '/', '%', '**', 'min', 'max', 'abs', 'floor', 'ceil', 'round', 'sqrt'] },
      right:      { type: 'text',   label: 'Right Operand',   placeholder: '1' },
    },
    async execute(data, ctx) {
      const resultVar = String(data.result_var || '').trim();
      if (!resultVar) return;

      const left  = parseFloat(ctx.resolve(String(data.left  ?? '0')));
      const right = parseFloat(ctx.resolve(String(data.right ?? '0')));
      const op    = data.operator || '+';

      let result;
      switch (op) {
        case '+':     result = left + right; break;
        case '-':     result = left - right; break;
        case '*':     result = left * right; break;
        case '/':     result = right !== 0 ? left / right : 0; break;
        case '%':     result = right !== 0 ? left % right : 0; break;
        case '**':    result = Math.pow(left, right); break;
        case 'min':   result = Math.min(left, right); break;
        case 'max':   result = Math.max(left, right); break;
        case 'abs':   result = Math.abs(left); break;
        case 'floor': result = Math.floor(left); break;
        case 'ceil':  result = Math.ceil(left); break;
        case 'round': result = Math.round(left); break;
        case 'sqrt':  result = Math.sqrt(left); break;
        default:      result = left + right;
      }

      if (!isFinite(result)) result = 0;
      ctx.vars.set(resultVar, result);
    },
  });

  // ── random_number ─────────────────────────────────────────────
  registry.register('random_number', {
    category: 'variables',
    label:    'Random Number',
    icon:     '🎲',
    color:    '#57f287',
    schema: {
      result_var: { type: 'text',   label: 'Result Variable', placeholder: 'rand' },
      min:        { type: 'number', label: 'Min',             default: 1 },
      max:        { type: 'number', label: 'Max',             default: 100 },
      float:      { type: 'toggle', label: 'Allow Decimals' },
    },
    async execute(data, ctx) {
      const resultVar = String(data.result_var || '').trim();
      if (!resultVar) return;
      const min = parseFloat(data.min ?? 1);
      const max = parseFloat(data.max ?? 100);
      let rand;
      if (data.float) {
        rand = Math.random() * (max - min) + min;
        rand = Math.round(rand * 100) / 100;
      } else {
        rand = Math.floor(Math.random() * (max - min + 1)) + min;
      }
      ctx.vars.set(resultVar, rand);
    },
  });

  // ── random_choice ─────────────────────────────────────────────
  registry.register('random_choice', {
    category: 'variables',
    label:    'Random Choice',
    icon:     '🎰',
    color:    '#57f287',
    schema: {
      result_var: { type: 'text',     label: 'Result Variable' },
      choices:    { type: 'textarea', label: 'Choices (one per line)', placeholder: 'Option 1\nOption 2\nOption 3' },
    },
    async execute(data, ctx) {
      const resultVar = String(data.result_var || '').trim();
      if (!resultVar) return;
      const raw     = ctx.resolve(String(data.choices || ''));
      const choices = raw.split('\n').map(s => s.trim()).filter(Boolean);
      if (!choices.length) return;
      const pick = choices[Math.floor(Math.random() * choices.length)];
      ctx.vars.set(resultVar, pick);
    },
  });

  // ── concat ────────────────────────────────────────────────────
  registry.register('concat', {
    category: 'variables',
    label:    'Concatenate Strings',
    icon:     '🔗',
    color:    '#57f287',
    schema: {
      result_var: { type: 'text', label: 'Result Variable' },
      parts:      { type: 'textarea', label: 'Parts (one per line, resolved & joined)', placeholder: 'Hello \n{user.name}\n!' },
      separator:  { type: 'text', label: 'Separator (optional)', placeholder: '' },
    },
    async execute(data, ctx) {
      const resultVar = String(data.result_var || '').trim();
      if (!resultVar) return;
      const sep   = String(data.separator ?? '');
      const parts = String(data.parts || '').split('\n').map(p => ctx.resolve(p.trim())).filter(Boolean);
      ctx.vars.set(resultVar, parts.join(sep));
    },
  });

  // ── string_op ─────────────────────────────────────────────────
  registry.register('string_op', {
    category: 'variables',
    label:    'String Operation',
    icon:     '🔤',
    color:    '#57f287',
    schema: {
      result_var: { type: 'text',   label: 'Result Variable' },
      input:      { type: 'text',   label: 'Input',           placeholder: '{myVar}' },
      operation:  { type: 'select', label: 'Operation',       options: ['upper', 'lower', 'trim', 'length', 'reverse', 'slice', 'replace', 'split'] },
      arg1:       { type: 'text',   label: 'Arg 1 (for slice: start; replace: search; split: separator)' },
      arg2:       { type: 'text',   label: 'Arg 2 (for slice: end; replace: replacement)' },
    },
    async execute(data, ctx) {
      const resultVar = String(data.result_var || '').trim();
      if (!resultVar) return;
      const input = ctx.resolve(String(data.input ?? ''));
      const arg1  = ctx.resolve(String(data.arg1  ?? ''));
      const arg2  = ctx.resolve(String(data.arg2  ?? ''));
      let out;

      switch (data.operation) {
        case 'upper':   out = input.toUpperCase(); break;
        case 'lower':   out = input.toLowerCase(); break;
        case 'trim':    out = input.trim(); break;
        case 'length':  out = String(input.length); break;
        case 'reverse': out = input.split('').reverse().join(''); break;
        case 'slice':   {
          const start = parseInt(arg1) || 0;
          const end   = arg2 !== '' ? parseInt(arg2) : undefined;
          out = input.slice(start, end);
          break;
        }
        case 'replace': out = input.replaceAll(arg1, arg2); break;
        case 'split':   out = JSON.stringify(input.split(arg1 || ',')); break;
        default:        out = input;
      }
      ctx.vars.set(resultVar, out ?? '');
    },
  });
}

module.exports = { register };

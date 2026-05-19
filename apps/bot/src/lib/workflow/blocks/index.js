'use strict';

/**
 * workflow/blocks/index.js — Block Executor Map
 *
 * Maps every block type name to its async executor function.
 *
 * Executor signature:
 *   async function executor(data, ctx, engine) { … }
 *
 *   data   — block.data (already-saved from dashboard editor)
 *   ctx    — ExecutionContext instance (has ctx.vars: VariableManager)
 *   engine — WorkflowEngine instance (for re-entrant sub-executions)
 *
 * Phase 1: Full implementations for flow-control and variable blocks.
 * Remaining blocks: implemented as best-effort Discord API calls.
 * Phase 2 will expand error handling, attachment support, and advanced options.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');

// ── Safe math evaluator (no eval, no new Function) ─────────────
// Recursive-descent parser supporting: + - * / % ( ) and floor/ceil/round/min/max/abs
// Numbers: integers and decimals. Unary minus supported.
const _SAFE_MATH_FNS = { floor: Math.floor, ceil: Math.ceil, round: Math.round, min: Math.min, max: Math.max, abs: Math.abs };

function evalMath(expr) {
  const s = String(expr).trim();
  // Allowlist: digits, decimal point, operators, parens, whitespace, and function names
  if (!/^[\d\s+\-*/%.(),a-z]+$/i.test(s)) return NaN;

  // Tokenizer
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/\d/.test(c) || (c === '.' && /\d/.test(s[i + 1] || ''))) {
      let num = '';
      while (i < s.length && /[\d.]/.test(s[i])) num += s[i++];
      tokens.push({ t: 'num', v: Number(num) });
    } else if (/[a-z]/i.test(c)) {
      let name = '';
      while (i < s.length && /[a-z]/i.test(s[i])) name += s[i++];
      if (!_SAFE_MATH_FNS[name]) return NaN; // unknown function
      tokens.push({ t: 'fn', v: name });
    } else if ('+-*/%()'.includes(c)) {
      tokens.push({ t: 'op', v: c });
      i++;
    } else {
      return NaN; // unexpected character
    }
  }

  let pos = 0;
  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  function parseExpr() {
    let left = parseTerm();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = eat().v;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  function parseTerm() {
    let left = parseFactor();
    while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/' || peek().v === '%')) {
      const op = eat().v;
      const right = parseFactor();
      if (op === '*') left = left * right;
      else if (op === '/') left = right !== 0 ? left / right : NaN;
      else left = left % right;
    }
    return left;
  }
  function parseFactor() {
    const tok = peek();
    if (!tok) return NaN;
    // Unary minus
    if (tok.t === 'op' && tok.v === '-') {
      eat();
      return -parseFactor();
    }
    // Unary plus
    if (tok.t === 'op' && tok.v === '+') {
      eat();
      return parseFactor();
    }
    // Parenthesised expression
    if (tok.t === 'op' && tok.v === '(') {
      eat(); // consume '('
      const val = parseExpr();
      if (peek() && peek().t === 'op' && peek().v === ')') eat(); // consume ')'
      return val;
    }
    // Safe function call: name(arg, arg, ...)
    if (tok.t === 'fn') {
      eat(); // function name
      const open = eat(); // '('
      if (!open || open.v !== '(') return NaN;
      const args = [];
      while (true) {
        args.push(parseExpr());
        if (!peek() || peek().v !== ',') break;
        eat(); // ','
      }
      if (peek() && peek().v === ')') eat(); // ')'
      return _SAFE_MATH_FNS[tok.v](...args);
    }
    // Number literal
    if (tok.t === 'num') {
      eat();
      return tok.v;
    }
    return NaN;
  }

  try {
    const result = parseExpr();
    return Number.isFinite(result) ? result : NaN;
  } catch {
    return NaN;
  }
}

// ── Ordinal helper ─────────────────────────────────────────────
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = Math.abs(n) % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Condition evaluator ────────────────────────────────────────
async function evaluateCondition(data, ctx) {
  const v = ctx.vars;
  switch (data.condition_type) {
    case 'has_role':         return ctx.member.roles.cache.has(data.role_id);
    case 'not_has_role':     return !ctx.member.roles.cache.has(data.role_id);
    case 'in_channel':       return ctx.channel.id === data.channel_id;
    case 'not_in_channel':   return ctx.channel.id !== data.channel_id;
    case 'var_equals':       return String(v.resolve(`{${data.var_name}}`)) === String(data.compare_value ?? '');
    case 'var_not_equals':   return String(v.resolve(`{${data.var_name}}`)) !== String(data.compare_value ?? '');
    case 'var_greater':      return Number(v.resolve(`{${data.var_name}}`)) > Number(data.compare_value ?? 0);
    case 'var_less':         return Number(v.resolve(`{${data.var_name}}`)) < Number(data.compare_value ?? 0);
    case 'var_contains':     return String(v.resolve(`{${data.var_name}}`)).includes(String(data.compare_value ?? ''));
    case 'var_is_empty': {
      const val = v.resolve(`{${data.var_name}}`);
      return val === `{${data.var_name}}` || val === '' || val === undefined;
    }
    case 'var_not_empty': {
      const val2 = v.resolve(`{${data.var_name}}`);
      return val2 !== `{${data.var_name}}` && val2 !== '' && val2 !== undefined;
    }
    case 'var_starts_with': return String(v.resolve(`{${data.var_name}}`)).startsWith(String(data.compare_value ?? ''));
    case 'var_ends_with':   return String(v.resolve(`{${data.var_name}}`)).endsWith(String(data.compare_value ?? ''));
    case 'user_has_perm':    return ctx.member.permissions.has(data.permission);
    case 'user_not_perm':    return !ctx.member.permissions.has(data.permission);
    case 'message_contains': return ctx.message?.content?.toLowerCase()
                               .includes(String(data.compare_value ?? '').toLowerCase()) ?? false;
    case 'mentioned_user':   return (ctx.message?.mentions?.users?.size > 0) ?? false;
    case 'random_chance':    return Math.random() * 100 < Number(data.chance_percent ?? 50);
    case 'arg_equals': {
      const arg0 = ctx.triggerMeta?.args?.[0] ?? '';
      return arg0 === String(data.compare_value ?? '');
    }
    case 'user_is_bot':   return ctx.user.bot === true;
    case 'user_is_human': return ctx.user.bot !== true;
    case 'user_equals':   return ctx.user.id === String(data.compare_value ?? '').replace(/[<@!>]/g, '');
    case 'number_between': {
      const n   = Number(v.resolve(`{${data.var_name}}`));
      const lo  = Number(data.min_value ?? 0);
      const hi  = Number(data.max_value ?? 100);
      return n >= lo && n <= hi;
    }
    default: return false;
  }
}

// ── Send helpers ───────────────────────────────────────────────
async function sendToTarget(ctx, payload, channelIdOverride) {
  const target = channelIdOverride
    ? (await ctx.guild.channels.fetch(channelIdOverride).catch(() => null))
    : ctx.channel;

  if (!target) return null;

  let msg;
  if (ctx.interaction && !ctx.replied && !channelIdOverride) {
    // Use interaction reply if possible
    if (ctx.interaction.deferred) {
      msg = await ctx.interaction.editReply(payload).catch(() => null);
    } else {
      msg = await ctx.interaction.reply({ ...payload, fetchReply: true }).catch(() => null);
    }
    ctx.replied = true;
  } else {
    msg = await target.send(payload).catch(() => null);
  }

  if (msg?.id) ctx.lastMessageId = msg.id;
  return msg;
}

// ═══════════════════════════════════════════════════════════════
// BLOCK EXECUTORS
// ═══════════════════════════════════════════════════════════════
const EXECUTORS = {};

// ── RESPOND ────────────────────────────────────────────────────

EXECUTORS.reply = async (data, ctx) => {
  const content = ctx.vars.resolve(data.content || '');
  const payload = {
    content,
    allowedMentions: data.ping_user
      ? { users: [ctx.user.id] }
      : { parse: [] },
  };

  if (ctx.interaction && !ctx.replied) {
    const ephemeral = data.ephemeral ?? false;
    if (ctx.interaction.deferred) {
      await ctx.interaction.editReply(payload).catch(() => {});
    } else {
      await ctx.interaction.reply({ ...payload, ephemeral, fetchReply: false }).catch(() => {});
    }
    ctx.replied = true;
  } else if (ctx.message) {
    await ctx.message.reply(payload).catch(() => {});
  } else {
    await ctx.channel.send(payload).catch(() => {});
  }
};

EXECUTORS.followup = async (data, ctx) => {
  const content = ctx.vars.resolve(data.content || '');
  if (ctx.interaction) {
    await ctx.interaction.followUp({ content, ephemeral: data.ephemeral ?? false }).catch(() => {});
  } else {
    await ctx.channel.send({ content }).catch(() => {});
  }
};

EXECUTORS.edit_reply = async (data, ctx) => {
  const content = ctx.vars.resolve(data.new_content || '');
  if (data.target === 'original' && ctx.interaction?.replied) {
    await ctx.interaction.editReply({ content }).catch(() => {});
  } else if (data.target === 'last' && ctx.lastMessageId) {
    const msg = await ctx.channel.messages.fetch(ctx.lastMessageId).catch(() => null);
    if (msg?.editable) await msg.edit({ content }).catch(() => {});
  } else if (data.target === 'by_id' && data.message_id_var) {
    const id = ctx.vars.resolve(`{${data.message_id_var}}`);
    const msg = await ctx.channel.messages.fetch(id).catch(() => null);
    if (msg?.editable) await msg.edit({ content }).catch(() => {});
  }
};

// ── MESSAGES ───────────────────────────────────────────────────

EXECUTORS.send_message = async (data, ctx) => {
  const content = ctx.vars.resolve(data.content || '');
  const msg = await sendToTarget(ctx, { content }, data.channel_id || null);
  if (msg && data.store_id_as) ctx.vars.setFlow(data.store_id_as, msg.id);
};

EXECUTORS.send_embed = async (data, ctx) => {
  const embed = new EmbedBuilder();
  if (data.title)       embed.setTitle(ctx.vars.resolve(data.title).slice(0, 256));
  if (data.description) embed.setDescription(ctx.vars.resolve(data.description).slice(0, 4096));
  if (data.color)       embed.setColor(data.color);
  if (data.footer)      embed.setFooter({ text: ctx.vars.resolve(data.footer).slice(0, 2048) });
  if (data.thumbnail)   embed.setThumbnail(ctx.vars.resolve(data.thumbnail));
  if (data.image)       embed.setImage(ctx.vars.resolve(data.image));
  if (data.url)         embed.setURL(ctx.vars.resolve(data.url));
  if (data.timestamp)   embed.setTimestamp();
  if (data.show_author) embed.setAuthor({ name: ctx.member.displayName, iconURL: ctx.user.displayAvatarURL() });

  if (Array.isArray(data.fields)) {
    for (const field of data.fields.slice(0, 25)) {
      embed.addFields({ name: ctx.vars.resolve(field.name || '\u200b'), value: ctx.vars.resolve(field.value || '\u200b'), inline: !!field.inline });
    }
  }

  const msg = await sendToTarget(ctx, { embeds: [embed] }, data.channel_id || null);
  if (msg && data.store_id_as) ctx.vars.setFlow(data.store_id_as, msg.id);
};

EXECUTORS.dm_user = async (data, ctx) => {
  const content = ctx.vars.resolve(data.content || '');
  try {
    await ctx.user.send({ content });
  } catch {
    if (!data.fail_silent) throw new Error(`Failed to DM ${ctx.user.tag}`);
  }
};

EXECUTORS.edit_message = async (data, ctx) => {
  const idVar   = data.message_id_var ? ctx.vars.resolve(`{${data.message_id_var}}`) : ctx.lastMessageId;
  const content = ctx.vars.resolve(data.new_content || '');
  if (!idVar) return;

  const ch = data.channel_id
    ? await ctx.guild.channels.fetch(data.channel_id).catch(() => null)
    : ctx.channel;
  if (!ch) return;

  const msg = await ch.messages.fetch(idVar).catch(() => null);
  if (msg?.editable) await msg.edit({ content }).catch(() => {});
};

EXECUTORS.delete_message = async (data, ctx) => {
  const delay = Number(data.delay_ms ?? 0);
  const doDelete = async () => {
    let msg = null;
    if (data.target === 'trigger')  msg = ctx.message;
    else if (data.target === 'bot_last' && ctx.lastMessageId) {
      msg = await ctx.channel.messages.fetch(ctx.lastMessageId).catch(() => null);
    } else if (data.target === 'by_id' && data.message_id_var) {
      const id = ctx.vars.resolve(`{${data.message_id_var}}`);
      msg = await ctx.channel.messages.fetch(id).catch(() => null);
    }
    if (msg?.deletable) await msg.delete().catch(() => {});
  };

  if (delay > 0) {
    setTimeout(doDelete, Math.min(delay, 60000));
  } else {
    await doDelete();
  }
};

EXECUTORS.pin_message = async (data, ctx) => {
  let msg = null;
  if (data.target === 'trigger') msg = ctx.message;
  else if (data.target === 'by_id' && data.message_id_var) {
    const id = ctx.vars.resolve(`{${data.message_id_var}}`);
    msg = await ctx.channel.messages.fetch(id).catch(() => null);
  }
  if (!msg) return;
  if (data.action === 'pin')   await msg.pin().catch(() => {});
  if (data.action === 'unpin') await msg.unpin().catch(() => {});
};

EXECUTORS.add_reaction = async (data, ctx) => {
  const emoji = data.emoji;
  if (!emoji) return;
  let msg = data.target === 'trigger' ? ctx.message : null;
  if (data.target === 'bot_last' && ctx.lastMessageId) {
    msg = await ctx.channel.messages.fetch(ctx.lastMessageId).catch(() => null);
  }
  if (msg) await msg.react(emoji).catch(() => {});
};

EXECUTORS.purge_messages = async (data, ctx) => {
  const count  = Math.min(Number(data.count || 5), 100);
  const filter = data.filter || 'all';

  const fetched = await ctx.channel.messages.fetch({ limit: count + 1 }).catch(() => null);
  if (!fetched) return;

  let toDelete = [...fetched.values()];
  if (filter === 'bots') toDelete = toDelete.filter((m) => m.author.bot);
  if (filter === 'user') toDelete = toDelete.filter((m) => m.author.id === ctx.user.id);

  // Only bulk-delete messages newer than 14 days (Discord API restriction)
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  toDelete = toDelete.filter((m) => m.createdTimestamp > cutoff).slice(0, 100);

  if (toDelete.length) await ctx.channel.bulkDelete(toDelete, true).catch(() => {});
};

// ── COMPONENTS ─────────────────────────────────────────────────

EXECUTORS.send_buttons = async (data, ctx) => {
  const buttons = (data.buttons || []).slice(0, 5).map((b) =>
    new ButtonBuilder()
      .setCustomId(b.customId || b.id || 'btn')
      .setLabel(ctx.vars.resolve(b.label || 'Button').slice(0, 80))
      .setStyle(ButtonStyle[b.style] || ButtonStyle.Secondary)
  );
  if (!buttons.length) return;

  const row = new ActionRowBuilder().addComponents(buttons);
  const payload = {
    content:    ctx.vars.resolve(data.message || '') || undefined,
    components: [row],
  };
  const msg = await sendToTarget(ctx, payload, data.channel_id || null);
  if (msg && data.store_id_as) ctx.vars.setFlow(data.store_id_as, msg.id);
};

EXECUTORS.send_select_menu = async (data, ctx) => {
  const options = (data.options || []).slice(0, 25).map((o) => ({
    label:       ctx.vars.resolve(o.label || 'Option').slice(0, 100),
    value:       String(o.value || o.label || 'opt').slice(0, 100),
    description: o.description ? ctx.vars.resolve(o.description).slice(0, 100) : undefined,
  }));
  if (!options.length) return;

  const menu = new StringSelectMenuBuilder()
    .setCustomId('wf_select')
    .setPlaceholder(ctx.vars.resolve(data.placeholder || 'Choose an option…').slice(0, 150))
    .setMinValues(data.min_values ?? 1)
    .setMaxValues(Math.min(data.max_values ?? 1, options.length))
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(menu);
  const payload = {
    content:    ctx.vars.resolve(data.message || '') || undefined,
    components: [row],
  };
  const msg = await sendToTarget(ctx, payload, data.channel_id || null);
  if (msg && data.store_id_as) ctx.vars.setFlow(data.store_id_as, msg.id);
};

EXECUTORS.show_modal = async (data, ctx) => {
  if (!ctx.interaction?.showModal) return; // modals only work on interactions

  const modal = new ModalBuilder()
    .setCustomId('wf_modal')
    .setTitle(ctx.vars.resolve(data.title || 'Form').slice(0, 45));

  const inputFields = (data.fields || []).slice(0, 5).map((f, i) =>
    new TextInputBuilder()
      .setCustomId(`wf_modal_${i}`)
      .setLabel(ctx.vars.resolve(f.label || `Field ${i + 1}`).slice(0, 45))
      .setStyle(f.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(f.required ?? false)
      .setMaxLength(f.max ?? 1000)
  );

  if (!inputFields.length) return;

  const rows = inputFields.map((fi) => new ActionRowBuilder().addComponents(fi));
  modal.addComponents(...rows);

  try {
    await ctx.interaction.showModal(modal);
    ctx.stopped = true; // pause execution — resumed by modalSubmit handler (Phase 2)
  } catch { /* interaction already replied */ }
};

// ── AWAIT INPUT ────────────────────────────────────────────────
// Phase 1: stub — full collector implementation in Phase 2
EXECUTORS.await_button = async (data, ctx) => {
  // Stub: collect interaction from the message's buttons
  if (!ctx.lastMessageId) return;
  const timeoutMs = Math.min((data.timeout_seconds ?? 60) * 1000, 300_000);

  const filter = (i) => i.customId === data.button_id && i.user.id === ctx.user.id;
  const msg = await ctx.channel.messages.fetch(ctx.lastMessageId).catch(() => null);
  if (!msg) return;

  try {
    const btnInteraction = await msg.awaitMessageComponent({ filter, time: timeoutMs });
    await btnInteraction.deferUpdate().catch(() => {});
    if (data.store_user_as) ctx.vars.setFlow(data.store_user_as, btnInteraction.user.id);
  } catch {
    if (data.on_timeout === 'stop') ctx.stopped = true;
  }
};

EXECUTORS.await_select = async (data, ctx) => {
  if (!ctx.lastMessageId) return;
  const timeoutMs = Math.min((data.timeout_seconds ?? 60) * 1000, 300_000);
  const msg = await ctx.channel.messages.fetch(ctx.lastMessageId).catch(() => null);
  if (!msg) return;

  try {
    const selInteraction = await msg.awaitMessageComponent({ componentType: 3, time: timeoutMs });
    await selInteraction.deferUpdate().catch(() => {});
    const selected = selInteraction.values.join(', ');
    if (data.store_values_as) ctx.vars.setFlow(data.store_values_as, selected);
  } catch {
    if (data.on_timeout === 'stop') ctx.stopped = true;
  }
};

EXECUTORS.await_message = async (data, ctx) => {
  const timeoutMs = Math.min((data.timeout_seconds ?? 60) * 1000, 300_000);
  const filter = (m) => m.author.id === ctx.user.id;

  try {
    const collected = await ctx.channel.awaitMessages({ filter, max: 1, time: timeoutMs, errors: ['time'] });
    const response = collected.first();
    if (response) {
      if (data.store_as) ctx.vars.setFlow(data.store_as, response.content);
      if (data.delete_response) await response.delete().catch(() => {});
    }
  } catch {
    if (data.on_timeout === 'stop') ctx.stopped = true;
  }
};

// ── CHANNELS ───────────────────────────────────────────────────

EXECUTORS.create_thread = async (data, ctx) => {
  if (!ctx.message) return;
  const name = ctx.vars.resolve(data.name || 'Thread').slice(0, 100);
  const autoArchiveDuration = Number(data.auto_archive ?? 1440);

  const thread = await ctx.message.startThread({ name, autoArchiveDuration }).catch(() => null);
  if (thread && data.store_id_as) ctx.vars.setFlow(data.store_id_as, thread.id);
};

EXECUTORS.set_channel_topic = async (data, ctx) => {
  const topic = ctx.vars.resolve(data.topic || '').slice(0, 1024);
  const ch = data.channel_id
    ? await ctx.guild.channels.fetch(data.channel_id).catch(() => null)
    : ctx.channel;
  if (ch?.setTopic) await ch.setTopic(topic).catch(() => {});
};

EXECUTORS.set_slowmode = async (data, ctx) => {
  const seconds = Math.min(Math.max(0, Number(data.seconds ?? 5)), 21600);
  const ch = data.channel_id
    ? await ctx.guild.channels.fetch(data.channel_id).catch(() => null)
    : ctx.channel;
  if (ch?.setRateLimitPerUser) await ch.setRateLimitPerUser(seconds).catch(() => {});
};

EXECUTORS.lock_channel = async (data, ctx) => {
  const ch = data.channel_id
    ? await ctx.guild.channels.fetch(data.channel_id).catch(() => null)
    : ctx.channel;
  if (!ch?.permissionOverwrites) return;

  const everyoneRole = ctx.guild.roles.everyone;
  const reason       = ctx.vars.resolve(data.reason || '');

  if (data.action === 'lock') {
    await ch.permissionOverwrites.edit(everyoneRole,
      { SendMessages: false }, { reason: reason || undefined }
    ).catch(() => {});
  } else {
    await ch.permissionOverwrites.edit(everyoneRole,
      { SendMessages: null }, { reason: reason || undefined }
    ).catch(() => {});
  }
};

// ── ROLES ──────────────────────────────────────────────────────

EXECUTORS.add_role = async (data, ctx) => {
  const member = data.target === 'mentioned'
    ? ctx.message?.mentions?.members?.first() ?? ctx.member
    : ctx.member;
  if (!member || !data.role_id) return;
  const reason = ctx.vars.resolve(data.reason || '') || undefined;
  await member.roles.add(data.role_id, reason).catch(() => {});
};

EXECUTORS.remove_role = async (data, ctx) => {
  const member = data.target === 'mentioned'
    ? ctx.message?.mentions?.members?.first() ?? ctx.member
    : ctx.member;
  if (!member || !data.role_id) return;
  const reason = ctx.vars.resolve(data.reason || '') || undefined;
  await member.roles.remove(data.role_id, reason).catch(() => {});
};

EXECUTORS.toggle_role = async (data, ctx) => {
  const member = data.target === 'mentioned'
    ? ctx.message?.mentions?.members?.first() ?? ctx.member
    : ctx.member;
  if (!member || !data.role_id) return;

  const has    = member.roles.cache.has(data.role_id);
  const action = has ? 'removed' : 'added';
  if (has) {
    await member.roles.remove(data.role_id).catch(() => {});
  } else {
    await member.roles.add(data.role_id).catch(() => {});
  }
  if (data.store_action_as) ctx.vars.setFlow(data.store_action_as, action);
};

// ── MEMBERS ────────────────────────────────────────────────────

EXECUTORS.set_nickname = async (data, ctx) => {
  const member = data.target === 'mentioned'
    ? ctx.message?.mentions?.members?.first() ?? ctx.member
    : ctx.member;
  if (!member) return;
  const nick = ctx.vars.resolve(data.nickname || '').slice(0, 32) || null;
  await member.setNickname(nick).catch(() => {});
};

EXECUTORS.kick_member = async (data, ctx) => {
  const member = data.target === 'mentioned'
    ? ctx.message?.mentions?.members?.first()
    : ctx.member;
  if (!member) return;
  const reason = ctx.vars.resolve(data.reason || '');
  if (data.dm_before && data.dm_message) {
    await member.user.send(ctx.vars.resolve(data.dm_message)).catch(() => {});
  }
  await member.kick(reason || undefined).catch(() => {});
};

EXECUTORS.ban_member = async (data, ctx) => {
  const member = data.target === 'mentioned'
    ? ctx.message?.mentions?.members?.first()
    : ctx.member;
  if (!member) return;
  const reason = ctx.vars.resolve(data.reason || '');
  if (data.dm_before) {
    await member.user.send(`You have been banned from ${ctx.guild.name}.`).catch(() => {});
  }
  await ctx.guild.members.ban(member.id, {
    reason:       reason || undefined,
    deleteMessageSeconds: (Number(data.delete_days ?? 0)) * 86400,
  }).catch(() => {});
};

EXECUTORS.timeout_member = async (data, ctx) => {
  const member = data.target === 'mentioned'
    ? ctx.message?.mentions?.members?.first()
    : ctx.member;
  if (!member) return;
  const ms     = Math.min(Number(data.duration_minutes ?? 10) * 60_000, 40_320 * 60_000);
  const reason = ctx.vars.resolve(data.reason || '') || undefined;
  await member.timeout(ms, reason).catch(() => {});
};

EXECUTORS.remove_timeout = async (data, ctx) => {
  const member = data.target === 'mentioned'
    ? ctx.message?.mentions?.members?.first()
    : ctx.member;
  if (!member) return;
  await member.timeout(null).catch(() => {});
};

EXECUTORS.get_member_info = async (data, ctx) => {
  const member = data.target === 'mentioned'
    ? ctx.message?.mentions?.members?.first() ?? ctx.member
    : ctx.member;
  if (!member) return;
  const prefix = data.var_prefix || 'member';
  ctx.vars.setFlow(`${prefix}_id`,       member.id);
  ctx.vars.setFlow(`${prefix}_username`, member.user.username);
  ctx.vars.setFlow(`${prefix}_nickname`, member.displayName);
  ctx.vars.setFlow(`${prefix}_joined`,   member.joinedAt?.toISOString() ?? '');
  ctx.vars.setFlow(`${prefix}_roles`,    [...member.roles.cache.values()].map((r) => r.name).join(', '));
  ctx.vars.setFlow(`${prefix}_avatar`,   member.user.displayAvatarURL({ size: 256 }));
};

EXECUTORS.warn_member = async (data, ctx) => {
  const member = data.target === 'mentioned'
    ? ctx.message?.mentions?.members?.first()
    : ctx.member;
  if (!member) return;
  const reason = ctx.vars.resolve(data.reason || '');
  if (data.dm_user) {
    await member.user.send(`You received a warning in **${ctx.guild.name}**: ${reason}`).catch(() => {});
  }
  // Actual warning storage is handled by the moderation module (Phase 2 integration)
};

// ── VARIABLES ──────────────────────────────────────────────────

EXECUTORS.set_variable = async (data, ctx) => {
  const name  = data.var_name;
  const value = ctx.vars.resolve(data.value || '');
  if (!name) return;

  if (data.scope === 'user' || data.scope === 'guild') {
    await ctx.vars.setPersistent(data.scope, name, value);
  } else {
    ctx.vars.setFlow(name, value);
  }
};

EXECUTORS.get_variable = async (data, ctx) => {
  const name    = data.var_name;
  const storeAs = data.store_as || name;
  if (!name) return;

  const value = await ctx.vars.getPersistent(data.scope || 'user', name, data.default_value ?? '');
  ctx.vars.setFlow(storeAs, value);
};

EXECUTORS.increment_variable = async (data, ctx) => {
  const name   = data.var_name;
  const amount = Number(data.amount ?? 1);
  if (!name) return;
  const next = await ctx.vars.incrementPersistent(data.scope || 'user', name, amount);
  ctx.vars.setFlow(name, next);
};

EXECUTORS.delete_variable = async (data, ctx) => {
  const name = data.var_name;
  if (!name) return;
  await ctx.vars.deletePersistent(data.scope || 'user', name);
  ctx.flowVars?.delete?.(name);
};

EXECUTORS.random_number = async (data, ctx) => {
  const min = Number(data.min ?? 1);
  const max = Number(data.max ?? 100);
  const r   = Math.floor(Math.random() * (max - min + 1)) + min;
  if (data.store_as) ctx.vars.setFlow(data.store_as, r);
};

EXECUTORS.random_choice = async (data, ctx) => {
  const raw     = ctx.vars.resolve(data.choices || '');
  const choices = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!choices.length) return;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  if (data.store_as) ctx.vars.setFlow(data.store_as, pick);
};

// ── MATH & TEXT ────────────────────────────────────────────────

EXECUTORS.math = async (data, ctx) => {
  const expr    = ctx.vars.resolve(data.expression || '0');
  const result  = evalMath(expr);
  if (data.store_as) ctx.vars.setFlow(data.store_as, Number.isFinite(result) ? result : 0);
};

EXECUTORS.format_text = async (data, ctx) => {
  const result = ctx.vars.resolve(data.template || '');
  if (data.store_as) ctx.vars.setFlow(data.store_as, result);
};

EXECUTORS.string_operation = async (data, ctx) => {
  const input = ctx.vars.resolve(data.text || '');
  let result  = input;

  switch (data.operation) {
    case 'uppercase': result = input.toUpperCase(); break;
    case 'lowercase': result = input.toLowerCase(); break;
    case 'trim':      result = input.trim();        break;
    case 'reverse':   result = input.split('').reverse().join(''); break;
    case 'length':    result = String(input.length); break;
    case 'replace':
      result = input.split(data.find || '').join(data.replace_with || '');
      break;
    case 'contains':
      result = input.includes(data.search || '') ? 'true' : 'false';
      break;
  }

  if (data.store_as) ctx.vars.setFlow(data.store_as, result);
};

EXECUTORS.number_format = async (data, ctx) => {
  const n = ctx.vars.resolveNumber(data.value || '0');
  let result;
  switch (data.format) {
    case 'thousands': result = n.toLocaleString('en-US'); break;
    case 'fixed_2':   result = n.toFixed(2);              break;
    case 'ordinal':   result = ordinal(Math.floor(n));    break;
    case 'compact': {
      if (Math.abs(n) >= 1_000_000) result = (n / 1_000_000).toFixed(1) + 'M';
      else if (Math.abs(n) >= 1_000) result = (n / 1_000).toFixed(1) + 'K';
      else result = String(n);
      break;
    }
    default: result = String(n);
  }
  if (data.store_as) ctx.vars.setFlow(data.store_as, result);
};

EXECUTORS.log_to_channel = async (data, ctx) => {
  if (!data.channel_id) return;
  const ch = await ctx.guild.channels.fetch(data.channel_id).catch(() => null);
  if (!ch) return;

  const message = ctx.vars.resolve(data.message || '');
  if (data.as_embed) {
    const embed = new EmbedBuilder()
      .setDescription(message.slice(0, 4096))
      .setColor(data.embed_color || '#5865f2')
      .setTimestamp();
    await ch.send({ embeds: [embed] }).catch(() => {});
  } else {
    await ch.send({ content: message.slice(0, 2000) }).catch(() => {});
  }
};

// ── FLOW CONTROL ───────────────────────────────────────────────

EXECUTORS.condition_if = async (data, ctx, engine) => {
  const passed = await evaluateCondition(data, ctx);
  const nested = passed ? (data.if_blocks || []) : (data.else_blocks || []);
  await engine._executeBlocks(nested, ctx);
};

EXECUTORS.stop_if = async (data, ctx) => {
  const passed = await evaluateCondition(data, ctx);
  if (!passed) return;

  if (data.reply_msg) {
    const content = ctx.vars.resolve(data.reply_msg).slice(0, 2000);
    const ephemeral = data.reply_ephemeral ?? true;
    if (ctx.interaction && !ctx.replied) {
      await ctx.interaction.reply({ content, ephemeral }).catch(() => {});
      ctx.replied = true;
    } else if (ctx.message) {
      await ctx.message.reply({ content }).catch(() => {});
    } else {
      await ctx.channel.send({ content }).catch(() => {});
    }
  }
  ctx.stopped = true;
};

EXECUTORS.loop_times = async (data, ctx, engine) => {
  const times = Math.min(Number(data.times ?? 1), 10);
  ctx.pushLoop(times);
  for (let i = 0; i < times; i++) {
    if (ctx.stopped) break;
    await engine._executeBlocks(data.loop_blocks || [], ctx);
    ctx.advanceLoop();
  }
  ctx.popLoop();
};

EXECUTORS.delay = async (data, ctx) => {
  const ms = Math.min(Math.max(100, Number(data.ms ?? 1000)), 10_000);
  await new Promise((res) => setTimeout(res, ms));
};

EXECUTORS.stop_flow = async (_data, ctx) => {
  ctx.stopped = true;
};

// ═══════════════════════════════════════════════════════════════
// ADVANCED FLOW & LOGIC
// ═══════════════════════════════════════════════════════════════

EXECUTORS.run_workflow = async (data, ctx, engine) => {
  const name = ctx.vars.resolve(data.workflow_name || '').trim();
  if (!name) return;

  // Prevent recursive cycles: max depth 3
  const depth = (ctx.triggerMeta?._runWorkflowDepth ?? 0) + 1;
  if (depth > 3) {
    console.warn('[WorkflowEngine] run_workflow: max nesting depth 3 reached, skipping.');
    return;
  }

  const Workflow = require('../../models/Workflow');
  const target = await Workflow.findOne({ guildId: ctx.guildId, name, enabled: true }).lean().catch(() => null);
  if (!target) return;

  await engine.run(target, {
    guild:       ctx.guild,
    member:      ctx.member,
    channel:     ctx.channel,
    message:     ctx.message,
    interaction: ctx.interaction,
    triggerMeta: { ...ctx.triggerMeta, _runWorkflowDepth: depth },
  });
};

EXECUTORS.try_catch = async (data, ctx, engine) => {
  const prevStopped = ctx.stopped;
  const prevErrored = ctx.errored;
  ctx.stopped = false;
  ctx.errored = false;
  ctx.lastError = null;

  try {
    await engine._executeBlocks(data.try_blocks || [], ctx);
  } catch (err) {
    ctx.lastError = err.message || 'Unknown error';
    ctx.vars.setFlow('_error_message', ctx.lastError);
  }

  if (ctx.errored || ctx.lastError) {
    ctx.stopped = false;
    ctx.errored = false;
    await engine._executeBlocks(data.catch_blocks || [], ctx);
  } else {
    ctx.stopped = prevStopped;
    ctx.errored = prevErrored;
  }
};

EXECUTORS.condition_multi = async (data, ctx, engine) => {
  const conditions = Array.isArray(data.conditions) ? data.conditions : [];
  const operator   = data.operator === 'or' ? 'or' : 'and';

  let passed;
  if (operator === 'and') {
    passed = true;
    for (const cond of conditions) {
      if (!(await evaluateCondition(cond, ctx))) { passed = false; break; }
    }
  } else {
    passed = false;
    for (const cond of conditions) {
      if (await evaluateCondition(cond, ctx)) { passed = true; break; }
    }
  }

  const nested = passed ? (data.if_blocks || []) : (data.else_blocks || []);
  await engine._executeBlocks(nested, ctx);
};

EXECUTORS.for_each = async (data, ctx, engine) => {
  const listVar = data.list_var;
  if (!listVar) return;

  const raw   = ctx.vars.resolve(`{${listVar}}`);
  if (!raw || raw === `{${listVar}}`) return;

  const items   = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const itemVar = data.item_var   || 'item';
  const idxVar  = data.index_var  || 'item_index';
  const maxIter = Math.min(items.length, 50);  // safety cap

  ctx.pushLoop(maxIter);
  for (let i = 0; i < maxIter; i++) {
    if (ctx.stopped) break;
    ctx.vars.setFlow(itemVar, items[i]);
    ctx.vars.setFlow(idxVar,  i);
    await engine._executeBlocks(data.loop_blocks || [], ctx);
    ctx.advanceLoop();
  }
  ctx.popLoop();
};

// ═══════════════════════════════════════════════════════════════
// LIST VARIABLE OPERATIONS
// ═══════════════════════════════════════════════════════════════

function _getList(ctx, listVar) {
  const raw = String(ctx.vars.getFlow(listVar) ?? '');
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

function _setList(ctx, listVar, items) {
  ctx.vars.setFlow(listVar, items.join(', '));
}

EXECUTORS.list_push = async (data, ctx) => {
  const listVar = data.list_var;
  const value   = ctx.vars.resolve(data.value || '');
  if (!listVar || value === '') return;

  const items = _getList(ctx, listVar);
  if (items.length >= 50) items.shift(); // rotate at cap
  items.push(value);
  _setList(ctx, listVar, items);
};

EXECUTORS.list_pop = async (data, ctx) => {
  const listVar = data.list_var;
  const storeAs = data.store_as || 'popped_item';
  if (!listVar) return;

  const items  = _getList(ctx, listVar);
  const popped = items.pop() ?? '';
  _setList(ctx, listVar, items);
  ctx.vars.setFlow(storeAs, popped);
};

EXECUTORS.list_get = async (data, ctx) => {
  const listVar = data.list_var;
  const index   = Math.max(0, Number(data.index ?? 0));
  const storeAs = data.store_as || 'list_item';
  if (!listVar) return;

  const items = _getList(ctx, listVar);
  ctx.vars.setFlow(storeAs, items[index] ?? '');
};

EXECUTORS.list_length = async (data, ctx) => {
  const listVar = data.list_var;
  const storeAs = data.store_as || 'list_length';
  if (!listVar) return;

  ctx.vars.setFlow(storeAs, _getList(ctx, listVar).length);
};

EXECUTORS.list_join = async (data, ctx) => {
  const listVar   = data.list_var;
  const separator = data.separator != null ? String(data.separator) : ', ';
  const storeAs   = data.store_as || 'joined_list';
  if (!listVar) return;

  ctx.vars.setFlow(storeAs, _getList(ctx, listVar).join(separator));
};

EXECUTORS.list_clear = async (data, ctx) => {
  if (data.list_var) ctx.vars.setFlow(data.list_var, '');
};

EXECUTORS.list_contains = async (data, ctx) => {
  const listVar = data.list_var;
  const value   = ctx.vars.resolve(data.value || '');
  const storeAs = data.store_as || 'list_has_item';
  if (!listVar) return;

  const found = _getList(ctx, listVar).includes(value);
  ctx.vars.setFlow(storeAs, found ? 'true' : 'false');
};

// ═══════════════════════════════════════════════════════════════
// HTTP / WEBHOOKS  (SSRF-safe — no private IPs, no filesystem)
// ═══════════════════════════════════════════════════════════════

function isSafeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '0.0.0.0' || h === '::1' || h === '[::1]') return false;
    if (/^127\./.test(h) || /^10\./.test(h)) return false;
    if (/^192\.168\./.test(h)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    if (/^fd[0-9a-f]{2}:/.test(h) || h === 'metadata.google.internal') return false;
    if (h === '169.254.169.254') return false;  // AWS/GCP metadata
    return true;
  } catch {
    return false;
  }
}

EXECUTORS.fetch_api = async (data, ctx) => {
  const url = ctx.vars.resolve(data.url || '').trim();
  if (!url || !isSafeUrl(url)) {
    if (data.store_status_as) ctx.vars.setFlow(data.store_status_as, '0');
    return;
  }

  const method = (data.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;

  const headers = { 'Content-Type': 'application/json', 'User-Agent': 'FlynnBot/1.0' };
  if (data.auth_header) {
    // Only allow Authorization or X-Api-Key style headers
    const authVal = ctx.vars.resolve(data.auth_header).slice(0, 256);
    if (authVal) headers['Authorization'] = authVal;
  }

  const options = {
    method,
    headers,
    signal: AbortSignal.timeout(8000),
  };

  if (['POST', 'PUT', 'PATCH'].includes(method) && data.body) {
    options.body = ctx.vars.resolve(data.body).slice(0, 10_000);
  }

  try {
    const res  = await fetch(url, options);
    const text = (await res.text()).slice(0, 2000);

    if (data.store_status_as) ctx.vars.setFlow(data.store_status_as, String(res.status));
    if (data.store_body_as)   ctx.vars.setFlow(data.store_body_as, text);

    // JSON field extraction: e.g. "data.user.name"
    if (data.extract_path && data.store_extract_as) {
      try {
        const json = JSON.parse(text);
        const parts = String(data.extract_path).split('.');
        let val = json;
        for (const p of parts) val = val?.[p];
        ctx.vars.setFlow(data.store_extract_as, String(val ?? ''));
      } catch { /* not JSON or path missing */ }
    }
  } catch (err) {
    if (data.store_status_as) ctx.vars.setFlow(data.store_status_as, '0');
    if (data.store_error_as)  ctx.vars.setFlow(data.store_error_as, err.message ?? 'Request failed');
    if (data.on_error === 'stop') ctx.stopped = true;
  }
};

EXECUTORS.send_webhook = async (data, ctx) => {
  const url = ctx.vars.resolve(data.webhook_url || '').trim();
  if (!url || !isSafeUrl(url)) return;
  // Enforce discord webhook format for safety
  if (!url.includes('discord.com/api/webhooks') && !data.allow_external) return;

  const content    = ctx.vars.resolve(data.content || '').slice(0, 2000) || undefined;
  const username   = ctx.vars.resolve(data.username || '').slice(0, 80)  || undefined;
  const avatarUrl  = data.avatar_url ? ctx.vars.resolve(data.avatar_url) : undefined;

  const payload = {};
  if (content)  payload.content  = content;
  if (username) payload.username = username;
  if (avatarUrl && isSafeUrl(avatarUrl)) payload.avatar_url = avatarUrl;

  if (data.embed_title || data.embed_description) {
    payload.embeds = [{
      title:       data.embed_title       ? ctx.vars.resolve(data.embed_title).slice(0, 256) : undefined,
      description: data.embed_description ? ctx.vars.resolve(data.embed_description).slice(0, 4096) : undefined,
      color:       data.embed_color ? parseInt(String(data.embed_color).replace('#', ''), 16) : 0x5865f2,
    }];
  }

  if (!payload.content && !payload.embeds) return;

  try {
    await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'FlynnBot/1.0' },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(8000),
    });
  } catch { /* ignore webhook failures */ }
};

// ═══════════════════════════════════════════════════════════════
// MEMBER / USER UTILITIES
// ═══════════════════════════════════════════════════════════════

EXECUTORS.add_temp_role = async (data, ctx) => {
  const member = data.target === 'mentioned'
    ? ctx.message?.mentions?.members?.first() ?? ctx.member
    : ctx.member;
  if (!member || !data.role_id) return;

  const durationMs = Math.min(Math.max(1, Number(data.duration_minutes ?? 10)), 10_080) * 60_000;
  await member.roles.add(data.role_id).catch(() => {});

  // Schedule removal (fire-and-forget; best-effort, survives process restarts only if TTL < uptime)
  setTimeout(async () => {
    try {
      const fresh = await member.guild.members.fetch(member.id).catch(() => null);
      if (fresh) await fresh.roles.remove(data.role_id).catch(() => {});
    } catch { /* member may have left */ }
  }, durationMs);
};

EXECUTORS.get_random_member = async (data, ctx) => {
  const prefix = (data.var_prefix || 'random_member').replace(/[^a-z0-9_]/gi, '_');
  try {
    const all     = ctx.guild.members.cache.size < 50
      ? (await ctx.guild.members.fetch().catch(() => ctx.guild.members.cache))
      : ctx.guild.members.cache;
    const humans  = all.filter((m) => !m.user.bot);
    if (!humans.size) return;
    const arr     = [...humans.values()];
    const picked  = arr[Math.floor(Math.random() * arr.length)];
    ctx.vars.setFlow(`${prefix}_id`,       picked.id);
    ctx.vars.setFlow(`${prefix}_username`, picked.user.username);
    ctx.vars.setFlow(`${prefix}_mention`,  `<@${picked.id}>`);
    ctx.vars.setFlow(`${prefix}_nickname`, picked.displayName);
  } catch { /* can't fetch members */ }
};

EXECUTORS.user_lookup = async (data, ctx) => {
  const raw    = ctx.vars.resolve(data.user_id || '').replace(/[<@!>]/g, '').trim();
  const prefix = (data.var_prefix || 'lookup').replace(/[^a-z0-9_]/gi, '_');
  if (!raw) return;

  try {
    const member = await ctx.guild.members.fetch(raw).catch(() => null);
    if (member) {
      ctx.vars.setFlow(`${prefix}_id`,       member.id);
      ctx.vars.setFlow(`${prefix}_username`, member.user.username);
      ctx.vars.setFlow(`${prefix}_mention`,  `<@${member.id}>`);
      ctx.vars.setFlow(`${prefix}_nickname`, member.displayName);
      ctx.vars.setFlow(`${prefix}_joined`,   member.joinedAt?.toISOString() ?? '');
      ctx.vars.setFlow(`${prefix}_roles`,    [...member.roles.cache.values()].map((r) => r.name).join(', '));
      ctx.vars.setFlow(`${prefix}_avatar`,   member.user.displayAvatarURL({ size: 256 }));
      ctx.vars.setFlow(`${prefix}_found`,    'true');
    } else {
      ctx.vars.setFlow(`${prefix}_found`, 'false');
    }
  } catch {
    ctx.vars.setFlow(`${prefix}_found`, 'false');
  }
};

// ═══════════════════════════════════════════════════════════════
// CHANNEL / ROLE CREATION
// ═══════════════════════════════════════════════════════════════

EXECUTORS.create_role = async (data, ctx) => {
  const name   = ctx.vars.resolve(data.name || 'New Role').slice(0, 100);
  const color  = data.color || '#000000';
  const reason = ctx.vars.resolve(data.reason || '') || undefined;
  const hoist  = !!data.hoist;

  try {
    const role = await ctx.guild.roles.create({ name, color, hoist, reason }).catch(() => null);
    if (role && data.store_id_as) ctx.vars.setFlow(data.store_id_as, role.id);
  } catch { /* insufficient permissions */ }
};

EXECUTORS.delete_role = async (data, ctx) => {
  const roleId = ctx.vars.resolve(data.role_id || '');
  if (!roleId) return;
  const reason = ctx.vars.resolve(data.reason || '') || undefined;
  try {
    const role = await ctx.guild.roles.fetch(roleId).catch(() => null);
    if (role) await role.delete(reason).catch(() => {});
  } catch { /* insufficient permissions */ }
};

// ═══════════════════════════════════════════════════════════════
// MESSAGE TEMPLATES (use stored embed templates)
// ═══════════════════════════════════════════════════════════════

EXECUTORS.use_template = async (data, ctx) => {
  const name = ctx.vars.resolve(data.template_name || '').trim();
  if (!name) return;

  // Import lazily to avoid circular dependencies
  const EmbedTemplate = (() => {
    try { return require('../../models/EmbedTemplate'); } catch { return null; }
  })();

  if (!EmbedTemplate) return;

  const tmpl = await EmbedTemplate.findOne({ guildId: ctx.guildId, name }).lean().catch(() => null);
  if (!tmpl) return;

  const { EmbedBuilder } = require('discord.js');
  const embed = new EmbedBuilder();
  const r = (s) => s ? ctx.vars.resolve(String(s)) : '';

  if (tmpl.title)       embed.setTitle(r(tmpl.title).slice(0, 256));
  if (tmpl.description) embed.setDescription(r(tmpl.description).slice(0, 4096));
  if (tmpl.color)       embed.setColor(tmpl.color);
  if (tmpl.footer?.text) embed.setFooter({ text: r(tmpl.footer.text).slice(0, 2048) });
  if (tmpl.image?.url)  embed.setImage(r(tmpl.image.url));
  if (tmpl.thumbnail?.url) embed.setThumbnail(r(tmpl.thumbnail.url));
  if (tmpl.url)         embed.setURL(r(tmpl.url));
  if (Array.isArray(tmpl.fields)) {
    for (const field of tmpl.fields.slice(0, 25)) {
      embed.addFields({ name: r(field.name || '\u200b'), value: r(field.value || '\u200b'), inline: !!field.inline });
    }
  }

  const target = data.channel_id
    ? await ctx.guild.channels.fetch(data.channel_id).catch(() => null)
    : ctx.channel;
  if (!target) return;

  const msg = await sendToTarget(ctx, { embeds: [embed] }, data.channel_id || null);
  if (msg && data.store_id_as) ctx.vars.setFlow(data.store_id_as, msg.id);
};

module.exports = EXECUTORS;

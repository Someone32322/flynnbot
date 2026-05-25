'use strict';

/**
 * VariableManager
 *
 * Resolves {variable} placeholders in strings and manages all variable namespaces.
 * Every block executor receives an ExecutionContext whose .vars property is a VariableManager.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  NAMESPACE          SYNTAX               DESCRIPTION                       │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │  Predefined         {user}, {server},    Built-in Discord context vars      │
 * │                     {channel}, etc.                                         │
 * │  Predefined nested  {user.id}, {server.count}, {channel.name}, ...          │
 * │  Slash options      {option.NAME}        Slash command option value         │
 * │  Component          {component.id}, {component.value}, {component.values}   │
 * │  Flow (runtime)     {varName}            Ephemeral, set by set_var block    │
 * │  Stored             {stored.refName}     Persisted via StoredVariableValue  │
 * │  Stored nested      {stored.ref.prop}    Object property access             │
 * │                     {stored.ref.0}       Collection index access            │
 * │                     {stored.ref.length}  Collection length                  │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Stored variable changes are buffered until execution completes, then the
 * ExecutionEngine flushes getDirtyStored() back to MongoDB.
 */

const { randomUUID } = require('crypto');

// Max flow (runtime) variables per execution
const MAX_FLOW_VARS  = 500;
// Max key length for flow variables
const MAX_KEY_LENGTH = 128;

/**
 * All predefined variable definitions — exported for the dashboard variable browser.
 *
 * Each entry: { key, label, description, category, example, availableIn }
 */
const PREDEFINED_VARS = [
  // ── User / Member ──────────────────────────────────────────────
  { key: 'user',              label: 'User Mention',        category: 'user',      description: 'Mentions the triggering user',             example: '@Flynn',                 availableIn: 'all' },
  { key: 'user.id',           label: 'User ID',             category: 'user',      description: 'The Discord user ID',                      example: '123456789012345678',      availableIn: 'all' },
  { key: 'user.name',         label: 'Username',            category: 'user',      description: 'Discord username',                         example: 'flynnbot',               availableIn: 'all' },
  { key: 'user.tag',          label: 'User Tag',            category: 'user',      description: 'Username (legacy: User#1234)',              example: 'flynnbot#0001',          availableIn: 'all' },
  { key: 'user.nickname',     label: 'Nickname',            category: 'user',      description: 'Server nickname, falls back to username',  example: 'Flynn',                  availableIn: 'all' },
  { key: 'user.mention',      label: 'User Mention',        category: 'user',      description: 'Same as {user} — <@userId>',               example: '<@123456789>',           availableIn: 'all' },
  { key: 'user.avatar',       label: 'Avatar URL',          category: 'user',      description: 'User avatar image URL',                    example: 'https://cdn.discordapp.com/...', availableIn: 'all' },
  { key: 'user.bot',          label: 'Is Bot',              category: 'user',      description: 'true if the user is a bot',                example: 'false',                  availableIn: 'all' },
  { key: 'user.createdate',   label: 'Account Created',     category: 'user',      description: 'Date the Discord account was created',     example: 'Mon Jan 01 2024',        availableIn: 'all' },
  { key: 'user.joindate',     label: 'Server Join Date',    category: 'user',      description: 'Date the user joined this server',         example: 'Tue Feb 14 2024',        availableIn: 'all' },
  { key: 'user.roles',        label: 'User Roles',          category: 'user',      description: 'Comma-separated list of role names',       example: 'Member, VIP',            availableIn: 'all' },
  { key: 'user.rolecount',    label: 'Role Count',          category: 'user',      description: 'Number of roles the member has',           example: '3',                      availableIn: 'all' },
  { key: 'userID',            label: 'User ID (short)',     category: 'user',      description: 'Shortcut for {user.id}',                   example: '123456789012345678',      availableIn: 'all' },
  { key: 'executor',          label: 'Executor Mention',    category: 'user',      description: 'Alias for {user}',                         example: '@Flynn',                 availableIn: 'all' },
  { key: 'executor.id',       label: 'Executor ID',         category: 'user',      description: 'Alias for {user.id}',                      example: '123456789012345678',      availableIn: 'all' },

  // ── Server / Guild ─────────────────────────────────────────────
  { key: 'server',             label: 'Server Name',        category: 'server',    description: 'The name of this Discord server',          example: 'My Server',              availableIn: 'all' },
  { key: 'server.id',          label: 'Server ID',          category: 'server',    description: 'The Discord guild ID',                     example: '987654321098765432',      availableIn: 'all' },
  { key: 'server.name',        label: 'Server Name',        category: 'server',    description: 'Same as {server}',                         example: 'My Server',              availableIn: 'all' },
  { key: 'server.count',       label: 'Member Count',       category: 'server',    description: 'Total member count',                       example: '1234',                   availableIn: 'all' },
  { key: 'server.icon',        label: 'Server Icon URL',    category: 'server',    description: 'Server icon image URL',                    example: 'https://cdn.discordapp.com/...', availableIn: 'all' },
  { key: 'server.owner',       label: 'Server Owner',       category: 'server',    description: 'Username of the server owner',             example: 'owner_username',         availableIn: 'all' },
  { key: 'server.boost_level', label: 'Boost Level',        category: 'server',    description: 'Server boost tier (0–3)',                  example: '2',                      availableIn: 'all' },
  { key: 'server.boost_count', label: 'Boost Count',        category: 'server',    description: 'Number of active boosts',                  example: '14',                     availableIn: 'all' },
  { key: 'membercount',        label: 'Member Count',       category: 'server',    description: 'Shortcut for {server.count}',              example: '1234',                   availableIn: 'all' },
  { key: 'serverID',           label: 'Server ID (short)',  category: 'server',    description: 'Shortcut for {server.id}',                 example: '987654321098765432',      availableIn: 'all' },

  // ── Channel ────────────────────────────────────────────────────
  { key: 'channel',            label: 'Channel Mention',    category: 'channel',   description: 'Mentions the current channel',             example: '#general',               availableIn: 'all' },
  { key: 'channel.id',         label: 'Channel ID',         category: 'channel',   description: 'The channel ID',                           example: '111222333444555666',      availableIn: 'all' },
  { key: 'channel.name',       label: 'Channel Name',       category: 'channel',   description: 'Channel name without #',                   example: 'general',                availableIn: 'all' },
  { key: 'channel.topic',      label: 'Channel Topic',      category: 'channel',   description: 'Channel topic/description',                example: 'General discussion',     availableIn: 'all' },

  // ── Message ────────────────────────────────────────────────────
  { key: 'message',            label: 'Message Content',    category: 'message',   description: 'Full message content',                     example: 'Hello world',            availableIn: 'message_triggers' },
  { key: 'message.id',         label: 'Message ID',         category: 'message',   description: 'The message ID',                           example: '999888777666555444',      availableIn: 'message_triggers' },
  { key: 'message.content',    label: 'Message Content',    category: 'message',   description: 'Same as {message}',                        example: 'Hello world',            availableIn: 'message_triggers' },
  { key: 'message.url',        label: 'Message URL',        category: 'message',   description: 'Jump link to the message',                 example: 'https://discord.com/channels/...', availableIn: 'message_triggers' },
  { key: 'message.attachments',label: 'Attachment Count',   category: 'message',   description: 'Number of attachments on the message',     example: '2',                      availableIn: 'message_triggers' },
  { key: 'args',               label: 'All Arguments',      category: 'message',   description: 'All arguments after the trigger word',     example: 'arg1 arg2 arg3',         availableIn: 'prefix' },
  { key: 'arg1',               label: 'Argument 1',         category: 'message',   description: 'First argument (space-separated)',          example: 'hello',                  availableIn: 'prefix' },
  { key: 'arg2',               label: 'Argument 2',         category: 'message',   description: 'Second argument',                           example: 'world',                  availableIn: 'prefix' },
  { key: 'arg3',               label: 'Argument 3',         category: 'message',   description: 'Third argument',                            example: 'foo',                    availableIn: 'prefix' },

  // ── Slash Command ──────────────────────────────────────────────
  { key: 'command',            label: 'Command Name',       category: 'slash',     description: 'The name of the slash command',             example: 'help',                   availableIn: 'slash' },
  { key: 'command.name',       label: 'Command Name',       category: 'slash',     description: 'Same as {command}',                         example: 'help',                   availableIn: 'slash' },
  { key: 'option.NAME',        label: 'Slash Option',       category: 'slash',     description: 'Value of slash option; replace NAME with the option name', example: '{option.target}', availableIn: 'slash' },

  // ── Component Interactions ─────────────────────────────────────
  { key: 'component.id',       label: 'Component ID',       category: 'component', description: 'Custom ID of the button/select/modal',     example: 'confirm-button',         availableIn: 'components' },
  { key: 'component.label',    label: 'Component Label',    category: 'component', description: 'Button label text',                        example: 'Click Me',               availableIn: 'button' },
  { key: 'component.value',    label: 'Selected Value',     category: 'component', description: 'First selected value from a select menu',  example: 'option-1',               availableIn: 'select_menu' },
  { key: 'component.values',   label: 'All Values',         category: 'component', description: 'All selected values, comma-separated',     example: 'opt-1, opt-2',           availableIn: 'select_menu' },

  // ── Modal ──────────────────────────────────────────────────────
  { key: 'modal.FIELD',        label: 'Modal Field',        category: 'modal',     description: 'Modal text input value; replace FIELD with the input custom ID', example: '{modal.feedback}', availableIn: 'modal_submit' },

  // ── Reactions ──────────────────────────────────────────────────
  { key: 'emoji',              label: 'Emoji',              category: 'reaction',  description: 'The reaction emoji (unicode or <:name:id>)', example: '⭐',                    availableIn: 'reaction' },
  { key: 'emoji.name',         label: 'Emoji Name',         category: 'reaction',  description: 'Emoji name',                               example: 'star',                   availableIn: 'reaction' },
  { key: 'reaction.message',   label: 'Reacted Message ID', category: 'reaction',  description: 'ID of the message that was reacted to',    example: '999888777666555',        availableIn: 'reaction' },

  // ── Voice ──────────────────────────────────────────────────────
  { key: 'voice.channel',      label: 'Voice Channel Name', category: 'voice',     description: 'Name of the voice channel',                example: 'General Voice',          availableIn: 'voice' },
  { key: 'voice.channel.id',   label: 'Voice Channel ID',   category: 'voice',     description: 'ID of the voice channel',                  example: '111222333444555',        availableIn: 'voice' },

  // ── Date / Time ────────────────────────────────────────────────
  { key: 'date',               label: 'Current Date',       category: 'time',      description: 'Human-readable current date',              example: 'Mon Jan 01 2025',        availableIn: 'all' },
  { key: 'time',               label: 'Current Time',       category: 'time',      description: 'Current time (HH:MM:SS)',                  example: '14:32:09',               availableIn: 'all' },
  { key: 'timestamp',          label: 'Unix Timestamp',     category: 'time',      description: 'Unix timestamp in seconds',                example: '1735689600',             availableIn: 'all' },
  { key: 'timestamp.ms',       label: 'Unix Timestamp ms',  category: 'time',      description: 'Unix timestamp in milliseconds',           example: '1735689600000',          availableIn: 'all' },
  { key: 'iso',                label: 'ISO Date String',    category: 'time',      description: 'ISO 8601 format date/time string',         example: '2025-01-01T00:00:00.000Z', availableIn: 'all' },

  // ── Execution ──────────────────────────────────────────────────
  { key: 'exec.id',            label: 'Execution ID',       category: 'execution', description: 'Unique UUID for this command execution',   example: 'a1b2c3d4-e5f6-...',      availableIn: 'all' },
  { key: 'exec.count',         label: 'Execution Count',    category: 'execution', description: 'Lifetime times this command has ever run', example: '42',                     availableIn: 'all' },
];

class VariableManager {
  /**
   * @param {object} opts
   * @param {import('discord.js').Guild}                     opts.guild
   * @param {import('discord.js').GuildMember|null}         opts.member
   * @param {import('discord.js').TextBasedChannel|null}    opts.channel
   * @param {{ type: string, value: string, raw: any }}     opts.trigger
   * @param {object[]} [opts.storedDefs=[]]    StoredVariable definition docs (lean)
   * @param {object[]} [opts.storedValues=[]]  StoredVariableValue docs (lean, guild+user scoped)
   * @param {string|null} [opts.userId=null]   Triggering user's Discord ID
   * @param {string|null} [opts.commandId=null] GuildCommand _id (for command-scoped vars)
   * @param {string}   [opts.executionId]      UUID for this execution
   * @param {number}   [opts.executionCount=0] Command's lifetime execution count
   */
  constructor({
    guild,
    member,
    channel,
    trigger,
    storedDefs     = [],
    storedValues   = [],
    userId         = null,
    commandId      = null,
    executionId    = null,
    executionCount = 0,
  }) {
    this._guild     = guild;
    this._member    = member;
    this._channel   = channel;
    this._trigger   = trigger;
    this._userId    = userId || member?.id || null;
    this._commandId = commandId;
    this._execId    = executionId || randomUUID();
    this._execCount = executionCount;

    /** @type {Map<string, *>} Ephemeral flow vars — cleared after execution */
    this._flow = new Map();

    /** @type {Map<string, object>} refName → StoredVariable definition */
    this._defsMap = new Map();
    for (const def of storedDefs) {
      this._defsMap.set(def.refName, def);
    }

    /** @type {Map<string, *>} refName → resolved value (default or loaded) */
    this._valuesMap = new Map();
    // Seed with defaults
    for (const def of storedDefs) {
      const dv = def.config?.defaultValue;
      if (dv !== undefined && dv !== null) {
        this._valuesMap.set(def.refName, dv);
      }
    }
    // Overlay with actually loaded values
    for (const val of storedValues) {
      const def = this._findDefById(String(val.definitionId));
      if (def) this._valuesMap.set(def.refName, val.value);
    }

    /** @type {Map<string, object>} refName → pending DB upsert/delete */
    this._dirtyVars = new Map();
  }

  // ── Flow variable access ──────────────────────────────────────────

  set(key, value) {
    const k = this._sanitizeKey(key);
    if (this._flow.size >= MAX_FLOW_VARS && !this._flow.has(k)) {
      throw new Error(`Flow variable limit reached (max ${MAX_FLOW_VARS} per execution)`);
    }
    this._flow.set(k, value);
  }

  get(key) {
    return this._flow.get(this._sanitizeKey(key));
  }

  has(key) {
    return this._flow.has(this._sanitizeKey(key));
  }

  delete(key) {
    this._flow.delete(this._sanitizeKey(key));
  }

  // ── Stored variable access ────────────────────────────────────────

  /**
   * Get the current value of a stored variable by refName.
   * Returns defaultValue if no value has been set.
   */
  getStored(refName) {
    if (this._valuesMap.has(String(refName))) return this._valuesMap.get(String(refName));
    return this._defsMap.get(String(refName))?.config?.defaultValue ?? null;
  }

  /**
   * Set a stored variable. Type-coerces + validates against the definition.
   * The new value is buffered; ExecutionEngine flushes getDirtyStored() to DB.
   */
  setStored(refName, value) {
    const ref = String(refName);
    const def = this._defsMap.get(ref);
    if (!def) throw new Error(`No stored variable "${ref}". Define it in the Data Storage section first.`);

    const coerced = this._coerce(value, def);
    this._valuesMap.set(ref, coerced);
    this._dirtyVars.set(ref, {
      definitionId: String(def._id),
      guildId:      String(this._guild?.id ?? ''),
      scope:        def.scope,
      userId:       def.scope === 'user'    ? this._userId    : null,
      commandId:    def.scope === 'command' ? this._commandId : null,
      value:        coerced,
      deleted:      false,
    });
  }

  /**
   * Reset a stored variable to its default value.
   */
  deleteStored(refName) {
    const ref = String(refName);
    const def = this._defsMap.get(ref);
    if (!def) return;
    const dv = def.config?.defaultValue ?? null;
    if (dv !== null) this._valuesMap.set(ref, dv);
    else this._valuesMap.delete(ref);

    this._dirtyVars.set(ref, {
      definitionId: String(def._id),
      guildId:      String(this._guild?.id ?? ''),
      scope:        def.scope,
      userId:       def.scope === 'user'    ? this._userId    : null,
      commandId:    def.scope === 'command' ? this._commandId : null,
      value:        null,
      deleted:      true,
    });
  }

  /**
   * Returns pending DB operations for the ExecutionEngine to flush after execution.
   * @returns {object[]}
   */
  getDirtyStored() {
    return Array.from(this._dirtyVars.values());
  }

  hasDirtyStored() {
    return this._dirtyVars.size > 0;
  }

  // ── String interpolation ──────────────────────────────────────────

  /**
   * Replace all {variable} placeholders in a template string.
   * Unresolved placeholders are left unchanged.
   * @param {*} template
   * @returns {string}
   */
  resolve(template) {
    if (typeof template !== 'string') return String(template ?? '');
    return template.replace(/\{([^{}]{1,256})\}/g, (match, key) => {
      try {
        const v = this._resolveKey(key.trim());
        return v !== undefined && v !== null ? String(v) : match;
      } catch {
        return match;
      }
    });
  }

  // ── Static helpers ────────────────────────────────────────────────

  static getPredefinedVars() {
    return PREDEFINED_VARS;
  }

  static getPredefinedVarsByCategory() {
    const groups = {};
    for (const v of PREDEFINED_VARS) {
      (groups[v.category] ??= []).push(v);
    }
    return groups;
  }

  // ── Private: resolution ───────────────────────────────────────────

  _resolveKey(key) {
    const lower = key.toLowerCase();

    if (lower.startsWith('stored.'))       return this._resolveStoredKey(key.slice(7));
    if (lower.startsWith('option.'))       return this._resolveOption(key.slice(7));
    if (lower.startsWith('modal.'))        return this._resolveModal(key.slice(6));
    if (lower.startsWith('member.'))       return this._resolveMemberProp(lower.slice(7));
    if (lower.startsWith('user.'))         return this._resolveMemberProp(lower.slice(5));
    if (lower.startsWith('server.'))       return this._resolveServerProp(lower.slice(7));
    if (lower.startsWith('channel.'))      return this._resolveChannelProp(lower.slice(8));
    if (lower.startsWith('message.'))      return this._resolveMessageProp(lower.slice(8));
    if (lower.startsWith('voice.'))        return this._resolveVoiceProp(lower.slice(6));
    if (lower.startsWith('component.'))    return this._resolveComponentProp(lower.slice(10));
    if (lower.startsWith('emoji.'))        return this._resolveEmojiProp(lower.slice(6));
    if (lower.startsWith('reaction.'))     return this._resolveReactionProp(lower.slice(9));
    if (lower.startsWith('exec.'))         return this._resolveExecProp(lower.slice(5));
    if (lower === 'timestamp.ms')          return Date.now();
    if (/^arg\d+$/.test(lower))            return this._getArgs()[parseInt(lower.slice(3), 10) - 1] ?? '';

    if (this._flow.has(key))   return this._flow.get(key);
    if (this._flow.has(lower)) return this._flow.get(lower);

    return this._resolveSystemKey(lower);
  }

  _resolveStoredKey(path) {
    const dot   = path.indexOf('.');
    const ref   = dot === -1 ? path : path.slice(0, dot);
    const rest  = dot === -1 ? null  : path.slice(dot + 1);
    const def   = this._defsMap.get(ref);
    const raw   = this._valuesMap.get(ref);
    const value = raw !== undefined && raw !== null ? raw : (def?.config?.defaultValue ?? null);

    if (value === null || value === undefined) return '';
    if (!rest) return value;

    if (def?.type === 'object' && typeof value === 'object' && !Array.isArray(value)) {
      return value[rest] ?? '';
    }
    if (def?.type === 'collection' || Array.isArray(value)) {
      if (rest === 'length') return Array.isArray(value) ? value.length : 0;
      const idx = parseInt(rest, 10);
      if (!isNaN(idx) && Array.isArray(value)) return value[idx] ?? '';
    }
    return '';
  }

  _resolveOption(name) {
    const raw = this._trigger?.raw;
    if (!raw?.isChatInputCommand?.()) return undefined;
    const opt = raw.options?.get(name.toLowerCase());
    return opt !== null && opt !== undefined ? (opt.value ?? String(opt)) : undefined;
  }

  _resolveModal(fieldId) {
    const raw = this._trigger?.raw;
    if (!raw?.isModalSubmit?.()) return undefined;
    return raw.fields?.getTextInputValue?.(fieldId) ?? raw.fields?.getField?.(fieldId)?.value ?? undefined;
  }

  _resolveMemberProp(prop) {
    const m = this._member;
    if (!m) return undefined;
    switch (prop) {
      case 'id':         return m.id;
      case 'name':
      case 'username':   return m.user?.username ?? '';
      case 'tag':        return m.user?.tag || m.user?.username || '';
      case 'nickname':   return m.nickname || m.user?.username || '';
      case 'mention':    return `<@${m.id}>`;
      case 'avatar':     return m.user?.displayAvatarURL({ size: 256 }) ?? '';
      case 'bot':        return m.user?.bot ? 'true' : 'false';
      case 'joindate':   return m.joinedAt?.toDateString() ?? '';
      case 'createdate': return m.user?.createdAt?.toDateString() ?? '';
      case 'roles':      return m.roles?.cache?.filter(r => r.id !== r.guild?.id)?.map(r => r.name)?.join(', ') ?? '';
      case 'rolecount':  return String((m.roles?.cache?.size ?? 1) - 1);
      default:           return undefined;
    }
  }

  _resolveServerProp(prop) {
    const g = this._guild;
    if (!g) return undefined;
    switch (prop) {
      case 'id':          return g.id;
      case 'name':        return g.name;
      case 'count':       return String(g.memberCount ?? 0);
      case 'icon':        return g.iconURL({ size: 256 }) ?? '';
      case 'owner':       return g.members?.cache?.get(g.ownerId)?.user?.username ?? g.ownerId ?? '';
      case 'boost_level': return String(g.premiumTier ?? 0);
      case 'boost_count': return String(g.premiumSubscriptionCount ?? 0);
      default:            return undefined;
    }
  }

  _resolveChannelProp(prop) {
    const c = this._channel;
    if (!c) return undefined;
    switch (prop) {
      case 'id':    return c.id;
      case 'name':  return c.name ?? '';
      case 'topic': return c.topic ?? '';
      default:      return undefined;
    }
  }

  _resolveMessageProp(prop) {
    const raw = this._trigger?.raw;
    const msg = raw?.content !== undefined ? raw : (raw?.message ?? null);
    if (!msg) return undefined;
    switch (prop) {
      case 'id':          return msg.id;
      case 'content':     return msg.content ?? '';
      case 'url':         return msg.url ?? '';
      case 'attachments': return String(msg.attachments?.size ?? 0);
      default:            return undefined;
    }
  }

  _resolveVoiceProp(prop) {
    const state = this._trigger?.raw?.newState ?? this._trigger?.raw;
    if (!state) return undefined;
    if (prop === 'channel')    return state.channel?.name ?? '';
    if (prop === 'channel.id') return state.channel?.id ?? '';
    return undefined;
  }

  _resolveComponentProp(prop) {
    const raw = this._trigger?.raw;
    if (!raw) return undefined;
    switch (prop) {
      case 'id':     return raw.customId ?? '';
      case 'label':  return raw.component?.label ?? '';
      case 'value':  return raw.values?.[0] ?? raw.customId ?? '';
      case 'values': return raw.values?.join(', ') ?? '';
      default:       return undefined;
    }
  }

  _resolveEmojiProp(prop) {
    const raw = this._trigger?.raw;
    const emoji = raw?.emoji ?? raw?.reaction?.emoji;
    if (!emoji) return undefined;
    if (prop === 'name') return emoji.name ?? emoji.toString();
    return undefined;
  }

  _resolveReactionProp(prop) {
    const raw = this._trigger?.raw;
    if (prop === 'message') return raw?.message?.id ?? raw?.messageId ?? '';
    return undefined;
  }

  _resolveExecProp(prop) {
    if (prop === 'id')    return this._execId;
    if (prop === 'count') return String(this._execCount);
    return undefined;
  }

  _getArgs() {
    const content = this._trigger?.raw?.content ?? this._trigger?.value ?? '';
    return String(content).trim().split(/\s+/).slice(1);
  }

  _resolveSystemKey(lower) {
    switch (lower) {
      case 'user':
      case 'executor':      return this._member ? `<@${this._member.id}>` : '';
      case 'userid':
      case 'executor.id':   return this._member?.id ?? this._userId ?? '';
      case 'server':
      case 'server.name':   return this._guild?.name ?? '';
      case 'serverid':
      case 'server.id':     return this._guild?.id ?? '';
      case 'membercount':
      case 'server.count':  return String(this._guild?.memberCount ?? 0);
      case 'channel':       return this._channel ? `<#${this._channel.id}>` : '';
      case 'channel.id':    return this._channel?.id ?? '';
      case 'channel.name':  return this._channel?.name ?? '';
      case 'message':
      case 'message.content': {
        const raw = this._trigger?.raw;
        return raw?.content ?? this._trigger?.value ?? '';
      }
      case 'args': return this._getArgs().join(' ');
      case 'date':       return new Date().toDateString();
      case 'time':       return new Date().toTimeString().slice(0, 8);
      case 'timestamp':  return String(Math.floor(Date.now() / 1000));
      case 'iso':        return new Date().toISOString();
      case 'trigger.value': return String(this._trigger?.value ?? '');
      case 'trigger.type':  return this._trigger?.type ?? '';
      case 'button.id':
      case 'component.id':  return this._trigger?.raw?.customId ?? '';
      case 'emoji': {
        const raw = this._trigger?.raw;
        const em = raw?.emoji ?? raw?.reaction?.emoji;
        return em?.toString() ?? em?.name ?? '';
      }
      case 'command':
      case 'command.name': {
        return this._trigger?.raw?.commandName ?? this._trigger?.value ?? '';
      }
      case 'exec.id':    return this._execId;
      case 'exec.count': return String(this._execCount);
      default:           return undefined;
    }
  }

  _sanitizeKey(key) {
    const k = String(key).slice(0, MAX_KEY_LENGTH);
    if (!k.trim()) throw new Error('Variable key must not be empty');
    return k;
  }

  _findDefById(id) {
    for (const def of this._defsMap.values()) {
      if (String(def._id) === id) return def;
    }
    return null;
  }

  /**
   * Type-coerce a value to match the StoredVariable definition's type.
   * Throws descriptive errors on invalid input.
   */
  _coerce(value, def) {
    switch (def.type) {
      case 'text': {
        const s = String(value ?? '');
        const max = def.config?.maxLength;
        if (max && s.length > max) throw new Error(`Value exceeds max length ${max} for "${def.refName}"`);
        return s;
      }
      case 'number': {
        const n = def.config?.isFloat ? parseFloat(value) : parseInt(value, 10);
        if (isNaN(n)) throw new Error(`"${value}" is not a valid number for "${def.refName}"`);
        const { min, max } = def.config || {};
        if (min !== null && min !== undefined && n < min) throw new Error(`${n} is below minimum ${min} for "${def.refName}"`);
        if (max !== null && max !== undefined && n > max) throw new Error(`${n} exceeds maximum ${max} for "${def.refName}"`);
        return n;
      }
      case 'user': {
        const id = String(value ?? '').trim();
        if (id && !/^\d{17,19}$/.test(id)) throw new Error(`"${id}" is not a valid Discord user ID for "${def.refName}"`);
        return id;
      }
      case 'channel': {
        const id = String(value ?? '').trim();
        if (id && !/^\d{17,19}$/.test(id)) throw new Error(`"${id}" is not a valid Discord channel ID for "${def.refName}"`);
        return id;
      }
      case 'collection': {
        let arr = Array.isArray(value) ? value : (() => { try { return JSON.parse(value); } catch { return [value]; } })();
        if (!Array.isArray(arr)) throw new Error(`Value for collection "${def.refName}" must be an array`);
        const maxSize = def.config?.maxSize ?? 100;
        if (arr.length > maxSize) throw new Error(`Collection "${def.refName}" exceeds max size ${maxSize}`);
        return arr;
      }
      case 'object': {
        let obj;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          obj = value;
        } else if (typeof value === 'string') {
          try { obj = JSON.parse(value); } catch { throw new Error(`Value for object "${def.refName}" is not valid JSON`); }
        } else {
          throw new Error(`Value for object "${def.refName}" must be a plain object`);
        }
        if (Array.isArray(obj)) throw new Error(`Value for object "${def.refName}" must not be an array`);
        // Prevent prototype pollution
        const safe = {};
        const props = def.config?.properties ?? [];
        if (props.length > 0) {
          for (const prop of props) {
            if (prop.refName === '__proto__' || prop.refName === 'constructor') continue;
            if (Object.prototype.hasOwnProperty.call(obj, prop.refName)) {
              safe[prop.refName] = obj[prop.refName];
            } else if (prop.required) {
              throw new Error(`Required property "${prop.refName}" missing in object "${def.refName}"`);
            } else if (prop.defaultValue !== null && prop.defaultValue !== undefined) {
              safe[prop.refName] = prop.defaultValue;
            }
          }
        } else {
          // No schema defined — accept any keys, block prototype pollution
          for (const [k, v] of Object.entries(obj)) {
            if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') safe[k] = v;
          }
        }
        return safe;
      }
      default:
        return value;
    }
  }
}

module.exports = { VariableManager, PREDEFINED_VARS };

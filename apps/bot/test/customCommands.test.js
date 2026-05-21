'use strict';
/**
 * customCommands.test.js
 * Run with: node --test test/customCommands.test.js
 *
 * Tests pure-utility exports from lib/customCommands.js.
 * No DB connection or Discord client is needed for most cases.
 */
const { test, describe, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ── Load module under test ────────────────────────────────────
// We do NOT require() WorkflowEngine or Discord.js — the module-level code
// only sets up Maps and intervals (safe to run without credentials).
const {
  matchesTrigger,
  checkCooldown,
  setCooldown,
  checkRestrictions,
  normalizeTriggerType,
  buildContext,
  initCustomCommands,
  invalidateCommandCache,
} = require('../src/lib/customCommands');

// ── Helpers ───────────────────────────────────────────────────

function makeCmd(overrides = {}) {
  return {
    _id:          'test-cmd-id',
    name:         'test',
    trigger:      '!hello',
    triggerType:  'prefix',
    cooldownSeconds: 0,
    caseSensitive: false,
    allowedChannels: [],
    allowedRoles:    [],
    cooldownScope:   'user',
    ...overrides,
  };
}

function makeMember(overrides = {}) {
  return {
    id:    'user-123',
    guild: { id: 'guild-456' },
    user:  { id: 'user-123', username: 'TestUser', tag: 'TestUser#0000' },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
describe('normalizeTriggerType()', () => {
  test('passes through canonical types unchanged', () => {
    assert.equal(normalizeTriggerType('slash'),       'slash');
    assert.equal(normalizeTriggerType('prefix'),      'prefix');
    assert.equal(normalizeTriggerType('exact'),       'exact');
    assert.equal(normalizeTriggerType('contains'),    'contains');
    assert.equal(normalizeTriggerType('startsWith'),  'startsWith');
    assert.equal(normalizeTriggerType('regex'),       'regex');
  });

  test('normalises legacy aliases', () => {
    assert.equal(normalizeTriggerType('slash_command'),  'slash');
    assert.equal(normalizeTriggerType('prefix_command'), 'prefix');
    assert.equal(normalizeTriggerType('exact_match'),    'exact');
  });

  test('lowercases the type', () => {
    assert.equal(normalizeTriggerType('SLASH'),    'slash');
    assert.equal(normalizeTriggerType('Contains'), 'contains');
  });

  test('defaults to exact for empty/null', () => {
    assert.equal(normalizeTriggerType(''),    'exact');
    assert.equal(normalizeTriggerType(null),  'exact');
    assert.equal(normalizeTriggerType(undefined), 'exact');
  });
});

// ─────────────────────────────────────────────────────────────
describe('matchesTrigger()', () => {
  test('exact — matches when content equals trigger (case-insensitive by default)', () => {
    const cmd = makeCmd({ trigger: '!hello', triggerType: 'exact' });
    assert.equal(matchesTrigger('!hello', cmd), true);
    assert.equal(matchesTrigger('!HELLO', cmd), true);  // case-insensitive
    assert.equal(matchesTrigger('!hello world', cmd), false);
  });

  test('exact — case-sensitive mode', () => {
    const cmd = makeCmd({ trigger: '!Hello', triggerType: 'exact', caseSensitive: true });
    assert.equal(matchesTrigger('!Hello', cmd), true);
    assert.equal(matchesTrigger('!hello', cmd), false);
  });

  test('prefix — behaves like exact', () => {
    const cmd = makeCmd({ trigger: '!ping', triggerType: 'prefix' });
    assert.equal(matchesTrigger('!ping', cmd), true);
    assert.equal(matchesTrigger('!pong', cmd), false);
  });

  test('slash — behaves like exact', () => {
    const cmd = makeCmd({ trigger: 'myslash', triggerType: 'slash' });
    assert.equal(matchesTrigger('myslash', cmd), true);
    assert.equal(matchesTrigger('other',   cmd), false);
  });

  test('contains — substring match', () => {
    const cmd = makeCmd({ trigger: 'hello', triggerType: 'contains' });
    assert.equal(matchesTrigger('say hello world', cmd), true);
    assert.equal(matchesTrigger('goodbye',         cmd), false);
  });

  test('startsWith — prefix of content', () => {
    const cmd = makeCmd({ trigger: '!cmd', triggerType: 'startsWith' });
    assert.equal(matchesTrigger('!cmd argument', cmd), true);
    assert.equal(matchesTrigger('!cmd',          cmd), true);
    assert.equal(matchesTrigger('say !cmd',      cmd), false);
  });

  test('regex — valid pattern', () => {
    const cmd = makeCmd({ trigger: '^!roll \\d+$', triggerType: 'regex' });
    assert.equal(matchesTrigger('!roll 6',   cmd), true);
    assert.equal(matchesTrigger('!roll abc', cmd), false);
  });

  test('regex — invalid pattern returns false (no throw)', () => {
    const cmd = makeCmd({ trigger: '[invalid(', triggerType: 'regex' });
    assert.equal(matchesTrigger('anything', cmd), false);
  });
});

// ─────────────────────────────────────────────────────────────
describe('checkRestrictions()', () => {
  test('passes when no restrictions are set', () => {
    const cmd = makeCmd({ allowedChannels: [], allowedRoles: [] });
    const result = checkRestrictions(cmd, 'channel-1', ['role-1']);
    assert.equal(result.ok, true);
  });

  test('fails when channel not in allowedChannels', () => {
    const cmd = makeCmd({ allowedChannels: ['channel-99'] });
    const result = checkRestrictions(cmd, 'channel-1', []);
    assert.equal(result.ok, false);
    assert.match(result.reason, /channel/i);
  });

  test('passes when channel IS in allowedChannels', () => {
    const cmd = makeCmd({ allowedChannels: ['channel-1'] });
    const result = checkRestrictions(cmd, 'channel-1', []);
    assert.equal(result.ok, true);
  });

  test('fails when member lacks required role', () => {
    const cmd = makeCmd({ allowedRoles: ['role-admin'] });
    const result = checkRestrictions(cmd, 'any-channel', ['role-member']);
    assert.equal(result.ok, false);
    assert.match(result.reason, /role/i);
  });

  test('passes when member has at least one required role', () => {
    const cmd = makeCmd({ allowedRoles: ['role-admin', 'role-mod'] });
    const result = checkRestrictions(cmd, 'any-channel', ['role-mod', 'role-other']);
    assert.equal(result.ok, true);
  });
});

// ─────────────────────────────────────────────────────────────
describe('checkCooldown() / setCooldown()', () => {
  test('no cooldown returns 0', () => {
    const cmd    = makeCmd({ cooldownSeconds: 0 });
    const member = makeMember();
    assert.equal(checkCooldown(cmd, member, 'ch-1'), 0);
  });

  test('after setCooldown, checkCooldown returns remaining > 0', () => {
    const cmd    = makeCmd({ _id: 'cd-test-1', cooldownSeconds: 60 });
    const member = makeMember({ id: 'user-cd-1', guild: { id: 'guild-cd-1' } });
    setCooldown(cmd, member, 'ch-1');
    const remaining = checkCooldown(cmd, member, 'ch-1');
    assert.ok(remaining > 0, `expected remaining > 0, got ${remaining}`);
    assert.ok(remaining <= 60_000, `expected remaining <= 60000, got ${remaining}`);
  });

  test('guild-scope cooldown key is shared across users', () => {
    const cmd = makeCmd({ _id: 'cd-guild', cooldownSeconds: 30, cooldownScope: 'guild' });
    const m1  = makeMember({ id: 'user-A', guild: { id: 'guild-G' } });
    const m2  = makeMember({ id: 'user-B', guild: { id: 'guild-G' } });
    setCooldown(cmd, m1, 'ch-x');
    assert.ok(checkCooldown(cmd, m2, 'ch-x') > 0, 'guild scope: user B should be on cooldown after user A');
  });

  test('channel-scope cooldown key differs per channel', () => {
    const cmd = makeCmd({ _id: 'cd-chan', cooldownSeconds: 30, cooldownScope: 'channel' });
    const m   = makeMember({ id: 'user-CC', guild: { id: 'guild-CC' } });
    setCooldown(cmd, m, 'chan-1');
    assert.ok(checkCooldown(cmd, m, 'chan-1') > 0,  'chan-1 should be on cooldown');
    assert.equal(checkCooldown(cmd, m, 'chan-2'), 0, 'chan-2 should NOT be on cooldown');
  });

  test('user-scope cooldown key differs per user', () => {
    const cmd = makeCmd({ _id: 'cd-user', cooldownSeconds: 30, cooldownScope: 'user' });
    const m1  = makeMember({ id: 'user-X', guild: { id: 'guild-Y' } });
    const m2  = makeMember({ id: 'user-Z', guild: { id: 'guild-Y' } });
    setCooldown(cmd, m1, 'ch-a');
    assert.ok(checkCooldown(cmd, m1, 'ch-a') > 0, 'user-X should be on cooldown');
    assert.equal(checkCooldown(cmd, m2, 'ch-a'), 0, 'user-Z should NOT be on cooldown');
  });
});

// ─────────────────────────────────────────────────────────────
describe('buildContext()', () => {
  test('returns null when initCustomCommands has not been called', () => {
    // No engine initialised → buildContext must return null (not throw)
    // Create an isolated require to get a fresh module state with no engine
    // We achieve this by calling buildContext before initCustomCommands runs
    // in this test environment (engine is null by default on first require).
    // Note: if other tests already called initCustomCommands this will fail;
    // the test order guarantees initCustomCommands is not called above.
    const ctx = buildContext({
      guild:   { id: 'g1' },
      member:  makeMember(),
      channel: { id: 'ch1' },
    });
    // engine is null → should return null
    assert.equal(ctx, null);
  });
});

// ─────────────────────────────────────────────────────────────
describe('invalidateCommandCache()', () => {
  test('does not throw for any guildId', () => {
    assert.doesNotThrow(() => invalidateCommandCache('guild-never-cached'));
    assert.doesNotThrow(() => invalidateCommandCache(null));
  });
});

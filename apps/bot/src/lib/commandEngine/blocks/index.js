'use strict';

/**
 * commandEngine/blocks/index.js
 *
 * Loads all block modules and registers them with a BlockRegistry.
 */

const MODULES = [
  './message',
  './flow',
  './variables',
  './stored',
  './role',
  './member',
  './channel',
  './utility',
];

/**
 * @param {import('../BlockRegistry').BlockRegistry} registry
 */
function loadBlocks(registry) {
  let count = 0;
  for (const mod of MODULES) {
    try {
      require(mod).register(registry);
    } catch (err) {
      console.error(`[CommandEngine] Failed to load block module ${mod}:`, err);
    }
  }
  count = registry.all().length;
  console.log(`[CommandEngine] Block registry loaded — ${count} blocks registered`);
}

module.exports = { loadBlocks };

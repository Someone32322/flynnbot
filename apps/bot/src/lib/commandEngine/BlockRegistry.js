'use strict';

/**
 * BlockRegistry
 *
 * Central registry for all block types in the command engine.
 * Block implementations register themselves here.
 *
 * Usage:
 *   const registry = new BlockRegistry();
 *   registry.register('reply', { category, label, validate, execute });
 *   const def = registry.get('reply');
 *   await def.execute(data, ctx);
 */
class BlockRegistry {
  constructor() {
    /** @type {Map<string, BlockDefinition>} */
    this._blocks = new Map();
  }

  /**
   * Register a block type.
   * @param {string} type - Unique block type key (e.g. 'reply', 'add_role')
   * @param {BlockDefinition} def
   */
  register(type, def) {
    if (this._blocks.has(type)) {
      console.warn(`[BlockRegistry] Overwriting existing block type: ${type}`);
    }
    this._blocks.set(type, { type, ...def });
  }

  /**
   * Get a block definition by type.
   * Returns null if not found (do not throw — let engine handle gracefully).
   * @param {string} type
   * @returns {BlockDefinition|null}
   */
  get(type) {
    return this._blocks.get(type) || null;
  }

  /**
   * Check if a block type is registered.
   * @param {string} type
   * @returns {boolean}
   */
  has(type) {
    return this._blocks.has(type);
  }

  /**
   * List all registered block types.
   * @returns {string[]}
   */
  list() {
    return Array.from(this._blocks.keys());
  }

  /**
   * Get all block definitions, optionally filtered by category.
   * @param {string} [category]
   * @returns {BlockDefinition[]}
   */
  all(category) {
    const defs = Array.from(this._blocks.values());
    if (category) return defs.filter(d => d.category === category);
    return defs;
  }

  /**
   * Validate block data against its definition's validator.
   * @param {string} type
   * @param {object} data
   * @throws {Error} if invalid
   */
  validate(type, data) {
    const def = this.get(type);
    if (!def) throw new Error(`Unknown block type: ${type}`);
    if (typeof def.validate === 'function') {
      def.validate(data);
    }
  }
}

/**
 * @typedef {object} BlockDefinition
 * @property {string} type - Block type key
 * @property {string} category - 'message' | 'flow' | 'member' | 'channel' | 'economy' | 'leveling' | 'utility' | 'advanced'
 * @property {string} label - Display name
 * @property {string} [icon] - Emoji or icon key
 * @property {object} [schema] - Field schema for frontend properties panel
 * @property {function(object): void} [validate] - Throw if data is invalid
 * @property {function(object, ExecutionContext): Promise<void>} execute - Runtime executor
 */

module.exports = { BlockRegistry };

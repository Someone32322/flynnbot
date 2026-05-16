'use strict';

const { TRIGGER_TYPES, LIMITS, BUILTIN_VARS } = require('./types');
// NOTE: registry.js is not copied to bot, so ALLOWED_TYPES/getBlock must be polyfilled or blocks/index.js must enforce types.

const MAX_ERRORS      = 30;
const VAR_NAME_RE     = /^[a-zA-Z_][a-zA-Z0-9_]{0,31}$/;
const WF_NAME_RE      = /^[a-z0-9_-]{1,50}$/;
const HTTPS_RE        = /^https:\/\//i;
const ALLOWED_TRIGGER = new Set(Object.values(TRIGGER_TYPES));

class WorkflowValidator {
	validate(wf) {
		const errors = [];
		if (!wf || typeof wf !== 'object') {
			return { valid: false, errors: ['Workflow must be an object.'] };
		}
		this._validateName(wf, errors);
		this._validateTrigger(wf.trigger, errors);
		this._validatePermissions(wf.permissions, errors);
		this._validateVariables(wf.variables, errors);
		this._validateBlocks(wf.blocks, errors, 0);
		return { valid: errors.length === 0, errors };
	}
	_validateName(wf, errors) {
		if (!wf.name) {
			errors.push('Workflow name is required.');
			return;
		}
		if (!WF_NAME_RE.test(wf.name)) {
			errors.push(`Workflow name "${wf.name}" is invalid. Use a-z, 0-9, hyphen, underscore, max 50 chars.`);
		}
		if (wf.description && wf.description.length > 200) {
			errors.push('Description cannot exceed 200 characters.');
		}
	}
	_validateTrigger(trigger, errors) {
		if (!trigger || typeof trigger !== 'object') {
			errors.push('A trigger is required.');
			return;
		}
		if (!trigger.type) {
			errors.push('Trigger type is required.');
			return;
		}
		if (!ALLOWED_TRIGGER.has(trigger.type)) {
			errors.push(`Unknown trigger type: "${trigger.type}".`);
			return;
		}
		// Types that need a value
		const needsValue = [
			TRIGGER_TYPES.SLASH_COMMAND,
			TRIGGER_TYPES.PREFIX_COMMAND,
			TRIGGER_TYPES.CONTAINS,
			TRIGGER_TYPES.EXACT_MATCH,
			TRIGGER_TYPES.REGEX,
		];
		if (needsValue.includes(trigger.type)) {
			if (!trigger.value || typeof trigger.value !== 'string' || !trigger.value.trim()) {
				errors.push(`Trigger type "${trigger.type}" requires a trigger value.`);
			} else if (trigger.value.length > 100) {
				errors.push('Trigger value cannot exceed 100 characters.');
			}
		}
		if (trigger.type === TRIGGER_TYPES.REGEX && trigger.value) {
			try {
				new RegExp(trigger.value);
			} catch {
				errors.push(`Trigger regex is invalid: ${trigger.value}`);
			}
		}
	}
	_validatePermissions(perms, errors) {
		if (!perms) return;
		if (perms.cooldownSeconds !== undefined) {
			const c = Number(perms.cooldownSeconds);
			if (!Number.isFinite(c) || c < 0 || c > 86400) {
				errors.push('cooldownSeconds must be between 0 and 86400 (24 hours).');
			}
		}
	}
	_validateVariables(vars, errors) {
		if (!vars) return;
		if (!Array.isArray(vars)) {
			errors.push('Workflow variables must be an array.');
			return;
		}
		const seen = new Set();
		for (const v of vars) {
			if (!v.name) { errors.push('A workflow variable is missing its name.'); continue; }
			if (!VAR_NAME_RE.test(v.name)) {
				errors.push(`Variable name "${v.name}" is invalid. Start with a letter/underscore, a-z0-9_. max 32.`);
			}
			if (BUILTIN_VARS.has(v.name)) {
				errors.push(`Variable name "${v.name}" is reserved. Choose a different name.`);
			}
			if (seen.has(v.name)) {
				errors.push(`Duplicate workflow variable name: "${v.name}".`);
			}
			seen.add(v.name);
		}
	}
	_validateBlocks(blocks, errors, depth) {
		if (!Array.isArray(blocks)) {
			if (blocks !== undefined && blocks !== null) {
				errors.push('Blocks must be an array.');
			}
			return;
		}
		if (depth === 0 && blocks.length > LIMITS.MAX_BLOCKS) {
			errors.push(`Too many blocks (max ${LIMITS.MAX_BLOCKS}).`);
		}
		if (depth > LIMITS.MAX_NESTING_DEPTH) {
			errors.push(`Block nesting too deep (max depth ${LIMITS.MAX_NESTING_DEPTH}).`);
			return;
		}
		for (let i = 0; i < blocks.length; i++) {
			if (errors.length >= MAX_ERRORS) return;
			this._validateBlock(blocks[i], errors, depth, i);
		}
	}
	_validateBlock(block, errors, depth, index) {
		const label = `Block[${index}]`;
		if (!block || typeof block !== 'object') {
			errors.push(`${label} is not an object.`);
			return;
		}
		if (!block.type) {
			errors.push(`${label} is missing a type.`);
			return;
		}
		// Type enforcement must be handled in blocks/index.js in the bot repo.
		const data = block.data || {};
		// No per-block custom validator in bot repo.
		// Check required fields (not enforced here).
		// Validate URLs for text fields containing https:// checks (not enforced here).
		// Recursively validate nested blocks
		if (data.if_blocks)   this._validateBlocks(data.if_blocks, errors, depth + 1);
		if (data.else_blocks) this._validateBlocks(data.else_blocks, errors, depth + 1);
		if (data.loop_blocks) this._validateBlocks(data.loop_blocks, errors, depth + 1);
	}
}

module.exports = WorkflowValidator;

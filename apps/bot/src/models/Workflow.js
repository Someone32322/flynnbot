'use strict';

const mongoose = require('mongoose');
const { TRIGGER_TYPES, VARIABLE_SCOPES } = require('../lib/workflow/types');

// A single field within a block's configuration
const BlockDataSchema = new mongoose.Schema({}, { strict: false, _id: false });

// Recursive block schema — blocks can contain nested blocks (branches, loops)
// Using a plain Mixed field to avoid Mongoose circular schema limitations.
// Validation of shape is handled by the WorkflowValidator, not Mongoose.
const BlockSchema = new mongoose.Schema({
	id:       { type: String, required: true },   // stable unique ID within this workflow
	type:     { type: String, required: true },   // e.g. 'reply', 'condition_if'
	position: {
		x: { type: Number, default: 0 },
		y: { type: Number, default: 0 },
	},
	data:     { type: mongoose.Schema.Types.Mixed, default: {} }, // block-specific config
}, { _id: false });

// Trigger configuration
const TriggerSchema = new mongoose.Schema({
	type:        { type: String, enum: Object.values(TRIGGER_TYPES), default: 'slash' },
	value:       { type: String, default: '', maxlength: 200 },  // command name / pattern
	description: { type: String, default: '', maxlength: 100 },  // slash command description
	// Slash command options (Phase 2)
	options: [{
		_id: false,
		name:        { type: String, maxlength: 32 },
		type:        { type: String, enum: ['string', 'integer', 'boolean', 'user', 'channel', 'role'], default: 'string' },
		description: { type: String, maxlength: 100, default: '' },
		required:    { type: Boolean, default: false },
		choices:     [{ _id: false, name: String, value: String }],
	}],
}, { _id: false });

// Permissions & restrictions
const PermissionsSchema = new mongoose.Schema({
	allowedRoles:        { type: [String], default: [] },
	allowedChannels:     { type: [String], default: [] },
	requiredPermissions: { type: [String], default: [] },   // Discord permissions
	caseSensitive:       { type: Boolean,  default: false },
	deleteUserMessage:   { type: Boolean,  default: false },
	cooldownSeconds:     { type: Number,   default: 0, min: 0, max: 86400 },
	cooldownScope:       { type: String,   enum: ['user', 'guild', 'channel'], default: 'user' },
	ephemeralErrors:     { type: Boolean,  default: true },  // show permission errors only to user
}, { _id: false });

// Workflow-level declared variable (for documentation / defaults)
const WorkflowVarSchema = new mongoose.Schema({
	name:         { type: String, required: true, maxlength: 32 },
	type:         { type: String, enum: ['string', 'number', 'boolean'], default: 'string' },
	scope:        { type: String, enum: Object.values(VARIABLE_SCOPES), default: 'flow' },
	defaultValue: { type: mongoose.Schema.Types.Mixed, default: null },
	description:  { type: String, default: '', maxlength: 200 },
}, { _id: false });

// Execution metadata (updated at runtime by the bot)
const MetadataSchema = new mongoose.Schema({
	executionCount:       { type: Number, default: 0 },
	lastExecutedAt:       { type: Date,   default: null },
	lastExecutionStatus:  { type: String, default: null },
	avgExecutionTimeMs:   { type: Number, default: 0 },
	errorCount:           { type: Number, default: 0 },
}, { _id: false });

const workflowSchema = new mongoose.Schema({
	guildId: { type: String, required: true, index: true },
	name:    { type: String, required: true, maxlength: 50,
						 match: /^[a-z0-9_-]{1,50}$/i },
	description: { type: String, default: '', maxlength: 200 },
	enabled:     { type: Boolean, default: true },
	version:     { type: Number, default: 1 },  // incremented on each save
	trigger: { type: TriggerSchema, default: () => ({}) },
	permissions: { type: PermissionsSchema, default: () => ({}) },
	blocks: { type: [BlockSchema], default: [] },
	variables: { type: [WorkflowVarSchema], default: [] },
	metadata: { type: MetadataSchema, default: () => ({}) },
	createdBy: { type: String, default: '' },
	updatedBy: { type: String, default: '' },
}, {
	timestamps: true,
	minimize: false,
});

workflowSchema.index({ guildId: 1, name: 1 },    { unique: true });
workflowSchema.index({ guildId: 1, enabled: 1 });
workflowSchema.index({ guildId: 1, 'trigger.type': 1 });

workflowSchema.virtual('blockCount').get(function () {
	return countBlocksDeep(this.blocks);
});

function countBlocksDeep(blocks) {
	if (!Array.isArray(blocks)) return 0;
	let count = 0;
	for (const b of blocks) {
		count++;
		const d = b.data || {};
		if (d.if_blocks)   count += countBlocksDeep(d.if_blocks);
		if (d.else_blocks) count += countBlocksDeep(d.else_blocks);
		if (d.loop_blocks) count += countBlocksDeep(d.loop_blocks);
	}
	return count;
}

workflowSchema.pre('save', function (next) {
	if (!this.isNew) this.version = (this.version || 1) + 1;
	next();
});

workflowSchema.statics.findByTrigger = function (guildId, triggerType) {
	return this.find({ guildId, enabled: true, 'trigger.type': triggerType }).lean();
};

workflowSchema.statics.recordExecution = function (workflowId, { success, durationMs }) {
	const update = {
		$inc: {
			'metadata.executionCount': 1,
			'metadata.errorCount': success ? 0 : 1,
		},
		$set: {
			'metadata.lastExecutedAt': new Date(),
			'metadata.lastExecutionStatus': success ? 'completed' : 'failed',
		},
	};
	return this.findByIdAndUpdate(workflowId, update, { new: false });
};

module.exports = mongoose.models.Workflow || mongoose.model('Workflow', workflowSchema);

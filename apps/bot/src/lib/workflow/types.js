'use strict';

const TRIGGER_TYPES = Object.freeze({
	SLASH:           'slash',
	PREFIX:          'prefix',
	CONTAINS:        'contains',
	EXACT:           'exact',
	REGEX:           'regex',
	BUTTON:          'button',
	SELECT_MENU:     'select_menu',
	REACTION_ADD:    'reaction_add',
	REACTION_REMOVE: 'reaction_remove',
	MEMBER_JOIN:     'member_join',
	MEMBER_LEAVE:    'member_leave',
	MESSAGE_DELETE:  'message_delete',
	VOICE_JOIN:      'voice_join',
	VOICE_LEAVE:     'voice_leave',
	SCHEDULED:       'scheduled',
	// Legacy aliases kept for backward compat
	REACTION:        'reaction_add',
});

const BLOCK_CATEGORIES = Object.freeze({
	RESPOND:    'respond',
	MESSAGES:   'messages',
	COMPONENTS: 'components',
	AWAIT:      'await',
	CHANNELS:   'channels',
	ROLES:      'roles',
	MEMBERS:    'members',
	VARIABLES:  'variables',
	MATH_TEXT:  'math_text',
	FLOW:       'flow',
});

const VARIABLE_SCOPES = Object.freeze({
	FLOW:   'flow',
	USER:   'user',
	GUILD:  'guild',
});

const FIELD_TYPES = Object.freeze({
	TEXT:          'text',
	TEXTAREA:      'textarea',
	NUMBER:        'number',
	TOGGLE:        'toggle',
	SELECT:        'select',
	ROLE:          'role',
	CHANNEL:       'channel',
	COLOR:         'color',
	EMBED_FIELDS:  'embed_fields',
	MODAL_FIELDS:  'modal_fields',
	BUTTON_ARRAY:  'button_array',
	OPTION_ARRAY:  'option_array',
	BRANCH_LABEL:  'branch_label',
});

const CONDITION_TYPES = Object.freeze({
	HAS_ROLE:         'has_role',
	NOT_HAS_ROLE:     'not_has_role',
	IN_CHANNEL:       'in_channel',
	NOT_IN_CHANNEL:   'not_in_channel',
	VAR_EQUALS:       'var_equals',
	VAR_NOT_EQUALS:   'var_not_equals',
	VAR_GREATER:      'var_greater',
	VAR_LESS:         'var_less',
	VAR_CONTAINS:     'var_contains',
	VAR_IS_EMPTY:     'var_is_empty',
	VAR_NOT_EMPTY:    'var_not_empty',
	VAR_STARTS_WITH:  'var_starts_with',
	VAR_ENDS_WITH:    'var_ends_with',
	USER_HAS_PERM:    'user_has_perm',
	USER_NOT_PERM:    'user_not_perm',
	MESSAGE_CONTAINS: 'message_contains',
	MENTIONED_USER:   'mentioned_user',
	RANDOM_CHANCE:    'random_chance',
	ARG_EQUALS:       'arg_equals',
	USER_IS_BOT:      'user_is_bot',
	USER_IS_HUMAN:    'user_is_human',
	USER_EQUALS:      'user_equals',
	NUMBER_BETWEEN:   'number_between',
});

const DISCORD_PERMISSIONS = Object.freeze([
	'Administrator',
	'ManageGuild',
	'ManageChannels',
	'ManageRoles',
	'ManageMessages',
	'ManageNicknames',
	'ManageWebhooks',
	'KickMembers',
	'BanMembers',
	'ModerateMembers',
	'MentionEveryone',
	'SendMessages',
	'ViewChannel',
]);

const LIMITS = Object.freeze({
	MAX_BLOCKS:           50,
	MAX_NESTING_DEPTH:    5,
	MAX_LOOP_ITERATIONS:  10,
	MAX_DELAY_MS:         10000,
	MAX_AWAIT_TIMEOUT_S:  300,
	MAX_WORKFLOWS_PER_GUILD: 100,
	MAX_VAR_NAME_LEN:     32,
	MAX_VAR_VALUE_LEN:    500,
	MAX_EMBED_FIELDS:     25,
	MAX_BUTTONS:          5,
	MAX_SELECT_OPTIONS:   25,
	MAX_MODAL_FIELDS:     5,
	EXECUTION_TIMEOUT_MS: 30000,
});

// Must be a Set so validator can call .has()
const BUILTIN_VARS = new Set([
	// Author / executor
	'user', 'username', 'displayname', 'userid', 'tag', 'avatar', 'executor',
	// Server
	'server', 'guild', 'serverid', 'guildid', 'membercount',
	// Channel
	'channel', 'channelname', 'channelid',
	// Message
	'message', 'command_name', 'args', 'trigger_value',
	// Mentions
	'mentioned', 'mentioned_id', 'mentioned_name',
	// Loop
	'loop_index', 'loop_count', 'item', 'item_index',
	// Date/time
	'timestamp', 'date', 'time',
	// Target user (set by member-action blocks)
	'targetUser', 'targetuser', 'reason',
	// Reaction trigger
	'reaction_emoji', 'reaction_emoji_id', 'reactor', 'reactor_id', 'reactor_name',
	'reacted_message',
	// Member join/leave trigger
	'new_member', 'new_member_id', 'new_member_name', 'new_member_avatar',
	'account_age_days', 'account_created',
	'left_member_name', 'left_member_id',
	// Button / select / modal interaction vars
	'button_id', 'button_user', 'button_user_id', 'button_user_name',
	'selected_values', 'selected_count',
	'modal_1', 'modal_2', 'modal_3', 'modal_4', 'modal_5',
	// Voice state trigger
	'voice_channel', 'voice_channel_id', 'voice_channel_name',
	// Scheduled trigger
	'scheduled_name', 'scheduled_time',
	// Error handling
	'_error_message',
]);

const EXEC_STATUS = Object.freeze({
	PENDING:   'pending',
	RUNNING:   'running',
	COMPLETED: 'completed',
	FAILED:    'failed',
	STOPPED:   'stopped',
	TIMEOUT:   'timeout',
});

module.exports = {
	TRIGGER_TYPES,
	BLOCK_CATEGORIES,
	VARIABLE_SCOPES,
	FIELD_TYPES,
	CONDITION_TYPES,
	DISCORD_PERMISSIONS,
	LIMITS,
	BUILTIN_VARS,
	EXEC_STATUS,
};

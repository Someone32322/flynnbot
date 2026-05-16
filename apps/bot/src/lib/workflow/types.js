'use strict';

const TRIGGER_TYPES = Object.freeze({
	SLASH:        'slash',
	PREFIX:       'prefix',
	CONTAINS:     'contains',
	EXACT:        'exact',
	REGEX:        'regex',
	BUTTON:       'button',
	SELECT_MENU:  'select_menu',
	REACTION:     'reaction',
	MEMBER_JOIN:  'member_join',
	MEMBER_LEAVE: 'member_leave',
	SCHEDULED:    'scheduled',
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
	USER_HAS_PERM:    'user_has_perm',
	USER_NOT_PERM:    'user_not_perm',
	MESSAGE_CONTAINS: 'message_contains',
	MENTIONED_USER:   'mentioned_user',
	RANDOM_CHANCE:    'random_chance',
	ARG_EQUALS:       'arg_equals',
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

const BUILTIN_VARS = Object.freeze([
	'user', 'username', 'usertag', 'userid',
	'server', 'guildid', 'membercount',
	'channel', 'channelid',
	'command_name', 'args',
	'mentioned', 'mentioned_id', 'mentioned_name',
	'loop_index', 'loop_count',
	'timestamp', 'date',
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

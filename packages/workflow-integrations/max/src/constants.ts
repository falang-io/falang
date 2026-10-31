export const MAX_VENDOR = 'max';
export const MAX_TRIGGER_NAME = 'max-trigger';
export const MAX_ON_COMMAND_TRIGGER_NAME = 'max-on-command-trigger';
/** `IFieldConfig.name` of the on-command trigger's `contextFields` entry — the `/command` name, minus the leading slash. */
export const MAX_COMMAND_FIELD_NAME = 'command';
export const MAX_SEND_MESSAGE_NAME = 'max-send-message';
export const MAX_SEND_FILE_NAME = 'max-send-file';
export const MAX_QUESTION_NAME = 'max-question';
export const MAX_SIGNAL_NAME = 'maxMessage';
/** Shared by every `max-question` node in a compiled workflow — button presses are correlated to a specific pending question by `messageId`, not by signal identity. */
export const MAX_QUESTION_ANSWER_SIGNAL_NAME = 'maxQuestionAnswer';
/** The identifier a compiled `trigger-function` binds the Max update payload to — see `ITriggerDescriptor.scopeVariableName`. */
export const MAX_SCOPE_VARIABLE_NAME = 'message';

/** Max Bot API's default endpoint (`https://dev.max.ru/docs-api`); overridable via `MAX_API_BASE_URL` for e2e mocks. */
export const MAX_DEFAULT_API_BASE_URL = 'https://platform-api.max.ru';

export const MAX_USER_TYPE_ID = 'max/User';
export const MAX_CHAT_TYPE_ID = 'max/Chat';
export const MAX_MESSAGE_TYPE_ID = 'max/Message';

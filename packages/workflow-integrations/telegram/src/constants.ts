export const TELEGRAM_VENDOR = 'telegram';
export const TELEGRAM_TRIGGER_NAME = 'telegram-trigger';
export const TELEGRAM_ON_COMMAND_TRIGGER_NAME = 'telegram-on-command-trigger';
/** `IFieldConfig.name` of the on-command trigger's `contextFields` entry — the `/command` name, minus the leading slash. */
export const TELEGRAM_COMMAND_FIELD_NAME = 'command';
export const TELEGRAM_SEND_MESSAGE_NAME = 'telegram-send-message';
export const TELEGRAM_SEND_FILE_NAME = 'telegram-send-file';
export const TELEGRAM_QUESTION_NAME = 'telegram-question';
export const TELEGRAM_SIGNAL_NAME = 'telegramMessage';
/** Shared by every `telegram-question` node in a compiled workflow — button presses are correlated to a specific pending question by `messageId`, not by signal identity. */
export const TELEGRAM_QUESTION_ANSWER_SIGNAL_NAME = 'telegramQuestionAnswer';
/** The identifier a compiled `trigger-function` binds the Telegram update payload to — see `ITriggerDescriptor.scopeVariableName`. */
export const TELEGRAM_SCOPE_VARIABLE_NAME = 'message';

export const TELEGRAM_USER_TYPE_ID = 'telegram/User';
export const TELEGRAM_CHAT_TYPE_ID = 'telegram/Chat';
export const TELEGRAM_MESSAGE_TYPE_ID = 'telegram/Message';

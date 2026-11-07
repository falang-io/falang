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
export const TELEGRAM_MESSAGE_ENTITY_TYPE_ID = 'telegram/MessageEntity';
export const TELEGRAM_MEMBER_EVENT_TYPE_ID = 'telegram/MemberEvent';
export const TELEGRAM_JOIN_REQUEST_TYPE_ID = 'telegram/JoinRequest';
export const TELEGRAM_MEMBER_INFO_TYPE_ID = 'telegram/MemberInfo';

/** Member triggers (ADR 0076 (private) §1): always one execution per event, see `buildMemberEventWorkflowId`. */
export const TELEGRAM_MEMBER_JOINED_TRIGGER_NAME = 'telegram-member-joined';
export const TELEGRAM_MEMBER_LEFT_TRIGGER_NAME = 'telegram-member-left';
export const TELEGRAM_JOIN_REQUEST_TRIGGER_NAME = 'telegram-join-request';
export const TELEGRAM_MEMBER_JOINED_SIGNAL_NAME = 'telegramMemberJoined';
export const TELEGRAM_MEMBER_LEFT_SIGNAL_NAME = 'telegramMemberLeft';
export const TELEGRAM_JOIN_REQUEST_SIGNAL_NAME = 'telegramJoinRequest';
/** The identifier a member/join-request trigger binds its payload to. */
export const TELEGRAM_EVENT_SCOPE_VARIABLE_NAME = 'event';
export const TELEGRAM_REQUEST_SCOPE_VARIABLE_NAME = 'request';

export const TELEGRAM_BAN_MEMBER_NAME = 'telegram-ban-member';
export const TELEGRAM_UNBAN_MEMBER_NAME = 'telegram-unban-member';
export const TELEGRAM_DELETE_MESSAGE_NAME = 'telegram-delete-message';
export const TELEGRAM_APPROVE_JOIN_REQUEST_NAME = 'telegram-approve-join-request';
export const TELEGRAM_DECLINE_JOIN_REQUEST_NAME = 'telegram-decline-join-request';
export const TELEGRAM_GET_MEMBER_NAME = 'telegram-get-member';

/**
 * Passed explicitly on every `getUpdates` and `setWebhook`: `chat_member` is never delivered by default, and an
 * omitted parameter keeps whatever the bot had set before (Bot API docs).
 */
export const TELEGRAM_ALLOWED_UPDATES: readonly string[] = [
  'message',
  'callback_query',
  'chat_member',
  'my_chat_member',
  'chat_join_request',
];

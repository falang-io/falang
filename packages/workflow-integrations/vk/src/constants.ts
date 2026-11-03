export const VK_VENDOR = 'vk';
export const VK_TRIGGER_NAME = 'vk-trigger';
export const VK_ON_COMMAND_TRIGGER_NAME = 'vk-on-command-trigger';
/** `IFieldConfig.name` of the on-command trigger's `contextFields` entry — the `/command` name, minus the leading slash. */
export const VK_COMMAND_FIELD_NAME = 'command';
export const VK_SEND_MESSAGE_NAME = 'vk-send-message';
export const VK_SEND_FILE_NAME = 'vk-send-file';
export const VK_QUESTION_NAME = 'vk-question';
export const VK_SIGNAL_NAME = 'vkMessage';
/** Shared by every `vk-question` node in a compiled workflow — button presses are correlated to a pending question by `messageId`. */
export const VK_QUESTION_ANSWER_SIGNAL_NAME = 'vkQuestionAnswer';
/** The identifier a compiled `trigger-function` binds the VK message payload to — see `ITriggerDescriptor.scopeVariableName`. */
export const VK_SCOPE_VARIABLE_NAME = 'message';

/** VK API's default endpoint (`https://dev.vk.com/ru/api/api-requests`), without `/method`; overridable via `VK_API_BASE_URL` for e2e mocks. */
export const VK_DEFAULT_API_BASE_URL = 'https://api.vk.ru';
/** API version sent as `v` on every call. */
export const VK_API_VERSION = '5.199';

export const VK_USER_TYPE_ID = 'vk/User';
export const VK_CHAT_TYPE_ID = 'vk/Chat';
export const VK_MESSAGE_TYPE_ID = 'vk/Message';

export const VK_VENDOR = 'vk';
export const VK_TRIGGER_NAME = 'vk-trigger';
export const VK_ON_COMMAND_TRIGGER_NAME = 'vk-on-command-trigger';
/** `IFieldConfig.name` of the on-command trigger's `contextFields` entry — the `/command` name, minus the leading slash. */
export const VK_COMMAND_FIELD_NAME = 'command';
export const VK_SEND_MESSAGE_NAME = 'vk-send-message';
export const VK_SEND_FILE_NAME = 'vk-send-file';
export const VK_SEND_BUTTONS_NAME = 'vk-send-buttons';
/** Key of a `vk-send-buttons` command button's callback payload (`{"falangCommand":"/help"}`); a question uses `falang`. */
export const VK_BUTTON_COMMAND_PAYLOAD_KEY = 'falangCommand';
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

export const VK_GROUP_MEMBER_JOINED_TRIGGER_NAME = 'vk-group-member-joined';
export const VK_GROUP_MEMBER_LEFT_TRIGGER_NAME = 'vk-group-member-left';
export const VK_JOIN_REQUEST_TRIGGER_NAME = 'vk-join-request';
export const VK_CHAT_MEMBER_JOINED_TRIGGER_NAME = 'vk-chat-member-joined';
export const VK_CHAT_MEMBER_LEFT_TRIGGER_NAME = 'vk-chat-member-left';
export const VK_GROUP_MEMBER_JOINED_SIGNAL_NAME = 'vkGroupMemberJoined';
export const VK_GROUP_MEMBER_LEFT_SIGNAL_NAME = 'vkGroupMemberLeft';
export const VK_JOIN_REQUEST_SIGNAL_NAME = 'vkJoinRequest';
export const VK_CHAT_MEMBER_JOINED_SIGNAL_NAME = 'vkChatMemberJoined';
export const VK_CHAT_MEMBER_LEFT_SIGNAL_NAME = 'vkChatMemberLeft';
/** The identifier a compiled member-event trigger-function binds its payload to. */
export const VK_EVENT_SCOPE_VARIABLE_NAME = 'event';
/** The identifier of `vk-join-request`. */
export const VK_REQUEST_SCOPE_VARIABLE_NAME = 'request';
export const VK_KICK_FROM_CHAT_NAME = 'vk-kick-from-chat';
export const VK_DELETE_MESSAGE_NAME = 'vk-delete-message';

export const VK_GROUP_MEMBER_EVENT_TYPE_ID = 'vk/GroupMemberEvent';
export const VK_CHAT_MEMBER_EVENT_TYPE_ID = 'vk/ChatMemberEvent';

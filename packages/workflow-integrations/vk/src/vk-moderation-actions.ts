import type { TVariableInfo } from '@falang/typescript-dto';
import type { IActionDescriptor } from '@falang/workflow-integrations-common';
import { VK_DELETE_MESSAGE_NAME, VK_KICK_FROM_CHAT_NAME, VK_VENDOR } from './constants.js';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

/**
 * Moderation actions (ADR 0076 (private) §3). Both are idempotent: a retry after a lost answer finds the member already
 * gone / the message already deleted, which VK reports as an error — mapped to success here. Temporal's default retry
 * policy is capped at 3 attempts. The community must be an administrator of the conversation (VK error 925 otherwise).
 */
const MODERATION_ACTIVITY_OPTIONS = { retry: { maximumAttempts: 3 } };

/**
 * Kicks a member out of a conversation (`messages.removeChatUser`). `chatId` is the conversation's `peer_id`
 * (2 000 000 000 + the VK chat id); the activity subtracts the offset. Error 935 ("no such user in the chat") is a
 * no-op, every other code (925 not an admin, 936 the user is a community, 945/946 chat closed, 983/984/1017) throws.
 * `groups.ban` (the community blacklist) needs a user token and is not available here.
 */
export const vkKickFromChatAction: IActionDescriptor = {
  name: VK_KICK_FROM_CHAT_NAME,
  label: 'vk:action.kickFromChat',
  fields: [
    { name: 'credentialId', label: 'vk:field.bot', kind: 'credential-ref', vendor: VK_VENDOR },
    { name: 'chatId', label: 'vk:field.chatId', kind: 'expression', expectedType: anyNumber },
    { name: 'userId', label: 'vk:field.userId', kind: 'expression', expectedType: anyNumber },
  ],
  emit: (fields) => `await vkKickFromChat(${fields.credentialId}, ${fields.chatId}, ${fields.userId});`,
  activitySignature: 'vkKickFromChat(credentialId: string, chatId: number, userId: number): Promise<void>',
  activityCode: [
    'export const vkKickFromChat = async (credentialId: string, chatId: number, userId: number): Promise<void> => {',
    "  if (chatId <= 2000000000) throw new Error('vk-kick-from-chat needs a conversation peer_id (above 2000000000), got ' + chatId);",
    '  const bot = await resolveVkAccessToken(credentialId);',
    '  try {',
    "    await vkApiCall(bot, 'messages.removeChatUser', { chat_id: chatId - 2000000000, member_id: userId });",
    '  } catch (error) {',
    '    // 935: the user is not in the chat (already removed) — the goal is reached.',
    '    if (vkErrorCode(error) === 935) return;',
    '    throw error;',
    '  }',
    '};',
  ].join('\n'),
  activityOptions: MODERATION_ACTIVITY_OPTIONS,
};

/**
 * Deletes a conversation message for everybody (`messages.delete` with `delete_for_all=1`). `chatId` is the `peer_id`,
 * `messageId` the `conversation_message_id` (the `vk/Message`'s `conversationMessageId`). Error 927 (the chat/message
 * does not exist any more) is a no-op; 924 (cannot delete for everybody) and the rest throw.
 */
export const vkDeleteMessageAction: IActionDescriptor = {
  name: VK_DELETE_MESSAGE_NAME,
  label: 'vk:action.deleteMessage',
  fields: [
    { name: 'credentialId', label: 'vk:field.bot', kind: 'credential-ref', vendor: VK_VENDOR },
    { name: 'chatId', label: 'vk:field.chatId', kind: 'expression', expectedType: anyNumber },
    { name: 'messageId', label: 'vk:field.conversationMessageId', kind: 'expression', expectedType: anyNumber },
  ],
  emit: (fields) => `await vkDeleteMessage(${fields.credentialId}, ${fields.chatId}, ${fields.messageId});`,
  activitySignature: 'vkDeleteMessage(credentialId: string, chatId: number, messageId: number): Promise<void>',
  activityCode: [
    'export const vkDeleteMessage = async (credentialId: string, chatId: number, messageId: number): Promise<void> => {',
    '  const bot = await resolveVkAccessToken(credentialId);',
    '  const groupId = await vkCommunityId(bot);',
    '  try {',
    "    await vkApiCall(bot, 'messages.delete', {",
    '      peer_id: chatId,',
    '      cmids: String(messageId),',
    '      delete_for_all: 1,',
    '      group_id: groupId,',
    '    });',
    '  } catch (error) {',
    '    // 927: the chat does not exist (any more), so neither does the message — the goal is reached.',
    '    if (vkErrorCode(error) === 927) return;',
    '    throw error;',
    '  }',
    '};',
  ].join('\n'),
  activityOptions: MODERATION_ACTIVITY_OPTIONS,
};

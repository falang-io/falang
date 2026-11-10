import type { TVariableInfo } from '@falang/typescript-dto';
import {
  SANDBOX_LINK_PAYLOAD_PREFIX,
  type IActionDescriptor,
  type IActivityOptions,
  type IFieldConfig,
} from '@falang/workflow-integrations-common';
import { VK_GET_MESSAGE_NAME, VK_GET_MESSAGES_NAME, VK_MESSAGE_TYPE_ID, VK_VENDOR } from './constants.js';
import { CONVERSATION_PEER_OFFSET } from './vk-message-mapper.js';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };
const messageType: TVariableInfo = { type: 'struct', id: VK_MESSAGE_TYPE_ID };

/** Reading is safe to repeat; three attempts cover a transient failure. */
const READ_ACTIVITY_OPTIONS: IActivityOptions = { retry: { maximumAttempts: 3 } };

/** How many messages `vk-get-messages` asks for when the node leaves the field empty; VK allows 1–200. */
export const VK_GET_MESSAGES_DEFAULT_COUNT = 20;

const credentialField: IFieldConfig = {
  name: 'credentialId',
  label: 'vk:field.bot',
  kind: 'credential-ref',
  vendor: VK_VENDOR,
};
const chatIdField: IFieldConfig = {
  name: 'chatId',
  label: 'vk:field.chatId',
  help: 'vk:help.readChatId',
  kind: 'expression',
  expectedType: anyNumber,
};
const resultField: IFieldConfig = { name: 'resultVariable', label: 'vk:field.resultVariable', kind: 'new-variable' };

const emitAssign = (call: string, variable: string | undefined): string =>
  variable ? `const ${variable} = ${call};` : `${call};`;

/**
 * Shared activity helpers (emitted once through `VK_SHARED_ACTIVITY_CODE`): a VK `message` + the `profiles` of an
 * `extended=1` answer -> `vk/Message`, mirroring the ingress mapping (`vk-message-mapper.ts`'s `toVkMessage`) except
 * that `text` is VK's own text (the ingress turns a "Начать" press into `/start`) and media is not downloaded
 * (`photo`/`document`/`voice` stay absent). `from` is set for user senders only, not for the community's own messages.
 */
export const VK_READ_SHARED_CODE = [
  'const vkProfilesOf = (response: any): Map<number, any> =>',
  '  new Map((Array.isArray(response?.profiles) ? response.profiles : []).map((profile: any) => [Number(profile.id), profile]));',
  '',
  'const vkToMessage = (raw: any, profiles: Map<number, any>): any => {',
  '  let payload: unknown = null;',
  '  if (raw?.payload) {',
  '    try {',
  '      const parsed = JSON.parse(raw.payload);',
  "      payload = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;",
  '    } catch {',
  '      payload = null;',
  '    }',
  '  }',
  '  const peerId = Number(raw?.peer_id ?? 0);',
  '  const fromId = Number(raw?.from_id ?? 0);',
  '  const profile = profiles.get(fromId);',
  `  const ref = typeof raw?.ref === 'string' && raw.ref && !raw.ref.startsWith('${SANDBOX_LINK_PAYLOAD_PREFIX}') ? raw.ref : null;`,
  '  return {',
  '    messageId: Number(raw?.id ?? 0),',
  '    conversationMessageId: Number(raw?.conversation_message_id ?? 0),',
  "    text: String(raw?.text ?? ''),",
  '    date: Number(raw?.date ?? 0),',
  `    chat: { id: peerId, type: peerId >= ${CONVERSATION_PEER_OFFSET} ? 'chat' : peerId < 0 ? 'group' : 'private' },`,
  '    ...(fromId > 0',
  '      ? {',
  '          from: {',
  '            id: fromId,',
  '            ...(profile?.first_name ? { firstName: String(profile.first_name) } : {}),',
  '            ...(profile?.last_name ? { lastName: String(profile.last_name) } : {}),',
  '          },',
  '        }',
  '      : {}),',
  '    ...(ref ? { ref } : {}),',
  '    payload,',
  '  };',
  '};',
].join('\n');

/**
 * "Get messages": `messages.getHistory` (`extended=1` for the senders' names) — the latest messages of a dialog or a
 * conversation, returned oldest first (by `conversation_message_id`) as `vk/Message[]`.
 */
export const vkGetMessagesAction: IActionDescriptor = {
  name: VK_GET_MESSAGES_NAME,
  label: 'vk:action.getMessages',
  fields: [
    credentialField,
    chatIdField,
    {
      name: 'count',
      label: 'vk:field.count',
      help: 'vk:help.messagesCount',
      agentNotes: 'How many of the latest messages to read: 1–200.',
      kind: 'expression',
      expectedType: anyNumber,
      defaultValue: String(VK_GET_MESSAGES_DEFAULT_COUNT),
    },
    resultField,
  ],
  resultType: { type: 'array', elementType: messageType, dimensions: 1 },
  emit: (fields) =>
    emitAssign(`await vkGetMessages(${fields.credentialId}, ${fields.chatId}, ${fields.count})`, fields.resultVariable),
  activitySignature: 'vkGetMessages(credentialId: string, chatId: number, count: number): Promise<any[]>',
  activityCode: [
    'export const vkGetMessages = async (credentialId: string, chatId: number, count: number): Promise<any[]> => {',
    '  const bot = await resolveVkAccessToken(credentialId);',
    `  const limit = Math.min(200, Math.max(1, Math.trunc(Number(count)) || ${VK_GET_MESSAGES_DEFAULT_COUNT}));`,
    "  const response = await vkApiCall(bot, 'messages.getHistory', { peer_id: chatId, count: limit, extended: 1 });",
    '  const profiles = vkProfilesOf(response);',
    '  const items: any[] = Array.isArray(response?.items) ? response.items : [];',
    '  return items',
    '    .map((raw) => vkToMessage(raw, profiles))',
    '    .sort((a, b) => a.conversationMessageId - b.conversationMessageId);',
    '};',
  ].join('\n'),
  activityOptions: READ_ACTIVITY_OPTIONS,
};

/** "Get message": `messages.getByConversationMessageId` -> one `vk/Message`; an unknown id fails the node. */
export const vkGetMessageAction: IActionDescriptor = {
  name: VK_GET_MESSAGE_NAME,
  label: 'vk:action.getMessage',
  fields: [
    credentialField,
    chatIdField,
    {
      name: 'messageId',
      label: 'vk:field.conversationMessageId',
      help: 'vk:help.conversationMessageId',
      kind: 'expression',
      expectedType: anyNumber,
    },
    resultField,
  ],
  resultType: messageType,
  emit: (fields) =>
    emitAssign(
      `await vkGetMessage(${fields.credentialId}, ${fields.chatId}, ${fields.messageId})`,
      fields.resultVariable,
    ),
  activitySignature: 'vkGetMessage(credentialId: string, chatId: number, messageId: number): Promise<any>',
  activityCode: [
    'export const vkGetMessage = async (credentialId: string, chatId: number, messageId: number): Promise<any> => {',
    '  const bot = await resolveVkAccessToken(credentialId);',
    "  const response = await vkApiCall(bot, 'messages.getByConversationMessageId', {",
    '    peer_id: chatId,',
    '    conversation_message_ids: messageId,',
    '    extended: 1,',
    '  });',
    '  const raw = Array.isArray(response?.items) ? response.items[0] : undefined;',
    '  if (!raw) throw new Error(`VK message ${messageId} not found in chat ${chatId}`);',
    '  return vkToMessage(raw, vkProfilesOf(response));',
    '};',
  ].join('\n'),
  activityOptions: READ_ACTIVITY_OPTIONS,
};

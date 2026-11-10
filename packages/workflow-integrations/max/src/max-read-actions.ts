import type { TVariableInfo } from '@falang/typescript-dto';
import type { IActionDescriptor, IActivityOptions, IFieldConfig } from '@falang/workflow-integrations-common';
import { MAX_GET_MESSAGE_NAME, MAX_GET_MESSAGES_NAME, MAX_MESSAGE_TYPE_ID, MAX_VENDOR } from './constants.js';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };
const messageType: TVariableInfo = { type: 'struct', id: MAX_MESSAGE_TYPE_ID };

/** Reading is safe to repeat; three attempts cover a transient failure. */
const READ_ACTIVITY_OPTIONS: IActivityOptions = { retry: { maximumAttempts: 3 } };

/** How many messages `max-get-messages` asks for when the node leaves the field empty; MAX allows 1–100. */
export const MAX_GET_MESSAGES_DEFAULT_COUNT = 20;

const resultField: IFieldConfig = { name: 'resultVariable', label: 'max:field.resultVariable', kind: 'new-variable' };

const emitAssign = (call: string, variable: string | undefined): string =>
  variable ? `const ${variable} = ${call};` : `${call};`;

/**
 * Shared activity helper (emitted once through `MAX_SHARED_ACTIVITY_CODE`): a MAX `Message` (snake_case wire shape) ->
 * `max/Message`, the same mapping the ingress does (`max-message-mapper.ts`'s `toMaxMessage`). Media is not downloaded:
 * `photo`/`document`/`audio`/`video` stay absent — the ingress turns them into files only for incoming updates.
 */
export const MAX_READ_SHARED_CODE = [
  'const maxToMessage = (raw: any): any => {',
  '  const sender = raw?.sender;',
  '  return {',
  "    messageId: String(raw?.body?.mid ?? ''),",
  '    timestamp: Number(raw?.timestamp ?? 0),',
  '    ...(raw?.body?.text ? { text: String(raw.body.text) } : {}),',
  "    chat: { id: Number(raw?.recipient?.chat_id ?? 0), type: String(raw?.recipient?.chat_type ?? '') },",
  '    ...(sender',
  '      ? {',
  '          from: {',
  '            id: Number(sender.user_id),',
  '            isBot: Boolean(sender.is_bot),',
  "            firstName: String(sender.first_name ?? ''),",
  '            ...(sender.last_name ? { lastName: String(sender.last_name) } : {}),',
  '            ...(sender.username ? { username: String(sender.username) } : {}),',
  '          },',
  '        }',
  '      : {}),',
  '  };',
  '};',
].join('\n');

/**
 * "Get messages": `GET /messages?chat_id=&count=` — the chat's latest messages, returned oldest first (sorted by
 * `timestamp`, then `body.seq`, whatever order MAX answers in) as `max/Message[]`.
 */
export const maxGetMessagesAction: IActionDescriptor = {
  name: MAX_GET_MESSAGES_NAME,
  label: 'max:action.getMessages',
  fields: [
    { name: 'credentialId', label: 'max:field.bot', kind: 'credential-ref', vendor: MAX_VENDOR },
    {
      name: 'chatId',
      label: 'max:field.chatId',
      help: 'max:help.readChatId',
      kind: 'expression',
      expectedType: anyNumber,
    },
    {
      name: 'count',
      label: 'max:field.count',
      help: 'max:help.messagesCount',
      agentNotes: 'How many of the latest messages to read: 1–100.',
      kind: 'expression',
      expectedType: anyNumber,
      defaultValue: String(MAX_GET_MESSAGES_DEFAULT_COUNT),
    },
    resultField,
  ],
  resultType: { type: 'array', elementType: messageType, dimensions: 1 },
  emit: (fields) =>
    emitAssign(
      `await maxGetMessages(${fields.credentialId}, ${fields.chatId}, ${fields.count})`,
      fields.resultVariable,
    ),
  activitySignature: 'maxGetMessages(credentialId: string, chatId: number, count: number): Promise<any[]>',
  activityCode: [
    'export const maxGetMessages = async (credentialId: string, chatId: number, count: number): Promise<any[]> => {',
    '  const bot = await resolveMaxBotToken(credentialId);',
    `  const limit = Math.min(100, Math.max(1, Math.trunc(Number(count)) || ${MAX_GET_MESSAGES_DEFAULT_COUNT}));`,
    "  const data = await maxApiRequest(bot, 'GET', 'messages', { chat_id: chatId, count: limit });",
    '  const list: any[] = Array.isArray(data?.messages) ? data.messages : [];',
    '  // Oldest first; messages of the same millisecond keep their order through `body.seq`.',
    '  const ordered = [...list].sort(',
    '    (a, b) => Number(a?.timestamp ?? 0) - Number(b?.timestamp ?? 0) || Number(a?.body?.seq ?? 0) - Number(b?.body?.seq ?? 0),',
    '  );',
    '  return ordered.map(maxToMessage);',
    '};',
  ].join('\n'),
  activityOptions: READ_ACTIVITY_OPTIONS,
};

/** "Get message": `GET /messages/{messageId}` -> one `max/Message`; an unknown id fails the node. */
export const maxGetMessageAction: IActionDescriptor = {
  name: MAX_GET_MESSAGE_NAME,
  label: 'max:action.getMessage',
  fields: [
    { name: 'credentialId', label: 'max:field.bot', kind: 'credential-ref', vendor: MAX_VENDOR },
    { name: 'messageId', label: 'max:field.messageId', kind: 'expression', expectedType: { type: 'string' } },
    resultField,
  ],
  resultType: messageType,
  emit: (fields) =>
    emitAssign(`await maxGetMessage(${fields.credentialId}, ${fields.messageId})`, fields.resultVariable),
  activitySignature: 'maxGetMessage(credentialId: string, messageId: string): Promise<any>',
  activityCode: [
    'export const maxGetMessage = async (credentialId: string, messageId: string): Promise<any> => {',
    '  const bot = await resolveMaxBotToken(credentialId);',
    "  const data = await maxApiRequest(bot, 'GET', `messages/${encodeURIComponent(messageId)}`, {});",
    '  return maxToMessage(data);',
    '};',
  ].join('\n'),
  activityOptions: READ_ACTIVITY_OPTIONS,
};

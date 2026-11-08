import type { TVariableInfo } from '@falang/typescript-dto';
import type { IActionDescriptor, IFieldConfig } from '@falang/workflow-integrations-common';
import {
  TELEGRAM_APPROVE_JOIN_REQUEST_NAME,
  TELEGRAM_BAN_MEMBER_NAME,
  TELEGRAM_DECLINE_JOIN_REQUEST_NAME,
  TELEGRAM_DELETE_MESSAGE_NAME,
  TELEGRAM_GET_MEMBER_NAME,
  TELEGRAM_MEMBER_INFO_TYPE_ID,
  TELEGRAM_UNBAN_MEMBER_NAME,
  TELEGRAM_VENDOR,
} from './constants.js';

/**
 * Moderation actions for groups and channels (ADR 0076 (private) §3). Each is idempotent where it can be: a message that
 * is already gone / a join request that is already handled is a successful no-op, every other Bot API error is thrown
 * with Telegram's own `description`.
 */

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };
const booleanType: TVariableInfo = { type: 'boolean' };

const credentialField: IFieldConfig = {
  name: 'credentialId',
  label: 'telegram:field.bot',
  kind: 'credential-ref',
  vendor: TELEGRAM_VENDOR,
};
const chatIdField: IFieldConfig = {
  name: 'chatId',
  label: 'telegram:field.chatId',
  kind: 'expression',
  expectedType: anyNumber,
};
const userIdField: IFieldConfig = {
  name: 'userId',
  label: 'telegram:field.userId',
  kind: 'expression',
  expectedType: anyNumber,
};

/** Shared by every action below; `telegramModerationCall` is emitted once, with the vendor's other shared helpers. */
export const TELEGRAM_MODERATION_SHARED_CODE = [
  '// Calls one Bot API method for a moderation action. A 400 whose `description` contains one of `tolerated` (lower-case',
  '// fragments, matched loosely: Telegram does not document the texts) is a successful no-op and returns null.',
  'const telegramModerationCall = async (',
  '  credentialId: string,',
  '  method: string,',
  '  payload: Record<string, unknown>,',
  '  tolerated: readonly string[],',
  '): Promise<unknown> => {',
  '  const { token: botToken, apiBaseUrl } = await resolveTelegramBotToken(credentialId);',
  '  const response = await fetch(`${apiBaseUrl}/bot${botToken}/${method}`, {',
  "    method: 'POST',",
  "    headers: { 'Content-Type': 'application/json' },",
  '    body: JSON.stringify(payload),',
  '  });',
  '  if (response.ok) {',
  '    const data = (await response.json()) as { result?: unknown };',
  '    return data.result;',
  '  }',
  '  const text = await response.text();',
  '  let description = text;',
  '  try {',
  '    description = (JSON.parse(text) as { description?: string }).description ?? text;',
  '  } catch {',
  '    description = text;',
  '  }',
  '  const lowered = description.toLowerCase();',
  '  if (tolerated.some((fragment) => lowered.includes(fragment))) return null;',
  '  throw new Error(`Telegram ${method} failed: ${response.status} ${description}`);',
  '};',
].join('\n');

const RETRY_THREE_TIMES = { retry: { maximumAttempts: 3 } } as const;

const telegramBanMemberAction: IActionDescriptor = {
  name: TELEGRAM_BAN_MEMBER_NAME,
  label: 'telegram:action.banMember',
  fields: [
    credentialField,
    chatIdField,
    userIdField,
    {
      name: 'untilDate',
      label: 'telegram:field.untilDate',
      help: 'telegram:help.untilDate',
      kind: 'expression',
      expectedType: anyNumber,
      defaultValue: '0',
    },
    {
      name: 'revokeMessages',
      label: 'telegram:field.revokeMessages',
      kind: 'expression',
      expectedType: booleanType,
      defaultValue: 'false',
    },
  ],
  emit: (fields) =>
    `await telegramBanMember(${fields.credentialId}, ${fields.chatId}, ${fields.userId}, ${fields.untilDate || '0'}, ${fields.revokeMessages || 'false'});`,
  activitySignature:
    'telegramBanMember(credentialId: string, chatId: number, userId: number, untilDate: number, revokeMessages: boolean): Promise<void>',
  activityCode: [
    'export const telegramBanMember = async (',
    '  credentialId: string,',
    '  chatId: number,',
    '  userId: number,',
    '  untilDate: number,',
    '  revokeMessages: boolean,',
    '): Promise<void> => {',
    "  // untilDate is a Unix time in seconds; 0 (or omitted) bans forever. Banning an already banned user is ok on Telegram's side.",
    '  await telegramModerationCall(',
    '    credentialId,',
    "    'banChatMember',",
    '    {',
    '      chat_id: chatId,',
    '      user_id: userId,',
    '      ...(untilDate > 0 ? { until_date: untilDate } : {}),',
    '      ...(revokeMessages ? { revoke_messages: true } : {}),',
    '    },',
    '    [],',
    '  );',
    '};',
  ].join('\n'),
  activityOptions: RETRY_THREE_TIMES,
};

const telegramUnbanMemberAction: IActionDescriptor = {
  name: TELEGRAM_UNBAN_MEMBER_NAME,
  label: 'telegram:action.unbanMember',
  fields: [credentialField, chatIdField, userIdField],
  emit: (fields) => `await telegramUnbanMember(${fields.credentialId}, ${fields.chatId}, ${fields.userId});`,
  activitySignature: 'telegramUnbanMember(credentialId: string, chatId: number, userId: number): Promise<void>',
  activityCode: [
    'export const telegramUnbanMember = async (credentialId: string, chatId: number, userId: number): Promise<void> => {',
    '  // only_if_banned: without it Telegram would also remove a user who is currently a member.',
    "  await telegramModerationCall(credentialId, 'unbanChatMember', { chat_id: chatId, user_id: userId, only_if_banned: true }, []);",
    '};',
  ].join('\n'),
  activityOptions: RETRY_THREE_TIMES,
};

const telegramDeleteMessageAction: IActionDescriptor = {
  name: TELEGRAM_DELETE_MESSAGE_NAME,
  label: 'telegram:action.deleteMessage',
  fields: [
    credentialField,
    chatIdField,
    {
      name: 'messageId',
      label: 'telegram:field.messageId',
      kind: 'expression',
      expectedType: anyNumber,
    },
  ],
  emit: (fields) => `await telegramDeleteMessage(${fields.credentialId}, ${fields.chatId}, ${fields.messageId});`,
  activitySignature: 'telegramDeleteMessage(credentialId: string, chatId: number, messageId: number): Promise<void>',
  activityCode: [
    'export const telegramDeleteMessage = async (credentialId: string, chatId: number, messageId: number): Promise<void> => {',
    '  // A message that is already deleted (or can no longer be) is a no-op, so a retry or a second handler is harmless.',
    '  await telegramModerationCall(',
    '    credentialId,',
    "    'deleteMessage',",
    '    { chat_id: chatId, message_id: messageId },',
    "    ['message to delete not found', \"message can't be deleted\"],",
    '  );',
    '};',
  ].join('\n'),
  activityOptions: RETRY_THREE_TIMES,
};

const joinRequestAction = (name: string, label: string, method: string, activity: string): IActionDescriptor => ({
  name,
  label,
  fields: [credentialField, chatIdField, userIdField],
  emit: (fields) => `await ${activity}(${fields.credentialId}, ${fields.chatId}, ${fields.userId});`,
  activitySignature: `${activity}(credentialId: string, chatId: number, userId: number): Promise<void>`,
  activityCode: [
    `export const ${activity} = async (credentialId: string, chatId: number, userId: number): Promise<void> => {`,
    '  // An already handled request (someone else approved/declined it, or the user joined another way) is a no-op.',
    `  await telegramModerationCall(credentialId, '${method}', { chat_id: chatId, user_id: userId }, [`,
    "    'user_already_participant',",
    "    'hide_requester_missing',",
    '  ]);',
    '};',
  ].join('\n'),
  activityOptions: RETRY_THREE_TIMES,
});

const MEMBER_INFO_TYPE: TVariableInfo = { type: 'struct', id: TELEGRAM_MEMBER_INFO_TYPE_ID };

const telegramGetMemberAction: IActionDescriptor = {
  name: TELEGRAM_GET_MEMBER_NAME,
  label: 'telegram:action.getMember',
  fields: [
    credentialField,
    chatIdField,
    userIdField,
    { name: 'resultVariable', label: 'telegram:field.resultVariable', kind: 'new-variable' },
  ],
  resultType: MEMBER_INFO_TYPE,
  emit: (fields) =>
    `const ${fields.resultVariable} = await telegramGetMember(${fields.credentialId}, ${fields.chatId}, ${fields.userId});`,
  activitySignature:
    'telegramGetMember(credentialId: string, chatId: number, userId: number): Promise<{ status: string; user: { id: number; isBot: boolean; firstName: string; username?: string }; isAdmin: boolean }>',
  activityCode: [
    'export const telegramGetMember = async (',
    '  credentialId: string,',
    '  chatId: number,',
    '  userId: number,',
    '): Promise<{ status: string; user: { id: number; isBot: boolean; firstName: string; username?: string }; isAdmin: boolean }> => {',
    "  const result = (await telegramModerationCall(credentialId, 'getChatMember', { chat_id: chatId, user_id: userId }, [])) as {",
    '    status: string;',
    '    user: { id: number; is_bot: boolean; first_name: string; username?: string };',
    '  };',
    '  return {',
    '    status: result.status,',
    '    user: { id: result.user.id, isBot: result.user.is_bot, firstName: result.user.first_name, username: result.user.username },',
    "    isAdmin: result.status === 'creator' || result.status === 'administrator',",
    '  };',
    '};',
  ].join('\n'),
  activityOptions: RETRY_THREE_TIMES,
};

export const telegramCommunityActions: readonly IActionDescriptor[] = [
  telegramBanMemberAction,
  telegramUnbanMemberAction,
  telegramDeleteMessageAction,
  joinRequestAction(
    TELEGRAM_APPROVE_JOIN_REQUEST_NAME,
    'telegram:action.approveJoinRequest',
    'approveChatJoinRequest',
    'telegramApproveJoinRequest',
  ),
  joinRequestAction(
    TELEGRAM_DECLINE_JOIN_REQUEST_NAME,
    'telegram:action.declineJoinRequest',
    'declineChatJoinRequest',
    'telegramDeclineJoinRequest',
  ),
  telegramGetMemberAction,
];

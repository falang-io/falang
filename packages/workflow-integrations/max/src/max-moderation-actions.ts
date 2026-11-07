import type { TVariableInfo } from '@falang/typescript-dto';
import type { IActionDescriptor, IActivityOptions } from '@falang/workflow-integrations-common';
import { MAX_DELETE_MESSAGE_NAME, MAX_REMOVE_MEMBER_NAME, MAX_VENDOR } from './constants.js';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

/** Short local activities: a moderation call is one quick request; three attempts cover a transient failure. */
const MODERATION_ACTIVITY_OPTIONS: IActivityOptions = { retry: { maximumAttempts: 3 } };

/**
 * Helper shared by both moderation activities (emitted once into `activities.ts` through `sharedActivityCode`; every
 * name is `max`-prefixed — see `max-shared-activity-code.ts`). MAX reports a failed `DELETE` through two channels: an
 * HTTP error status (401/403/404/500) and a `200 { success: false, message }` body (OpenAPI schema, 2026-11). Both
 * throw — except "the user is already not a member / the message is already gone", which is a no-op success so a
 * retried or repeated moderation step does not fail the workflow.
 *
 * ASSUMPTION: the platform documents neither the HTTP code nor the `message` text for "already removed"; HTTP 404, or
 * `success: false` with a `message` matching `MAX_NOT_FOUND_PATTERN` below, is treated as that case.
 */
export const MAX_MODERATION_SHARED_CODE = [
  String.raw`const MAX_NOT_FOUND_PATTERN = /not\s*(a\s*)?(member|found|exist)/i;`,
  '',
  'const maxModerationDelete = async (',
  '  bot: { token: string; apiBaseUrl: string },',
  '  path: string,',
  '  query: Record<string, string | number | boolean>,',
  '): Promise<void> => {',
  '  const url = new URL(`${bot.apiBaseUrl}/${path}`);',
  '  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));',
  "  const response = await fetch(url, { method: 'DELETE', headers: { Authorization: bot.token } });",
  '  const text = await response.text();',
  '  if (response.status === 404) return;',
  '  if (!response.ok) throw new Error(`Max DELETE /${path} failed: ${response.status} ${text}`);',
  '  let data: any = {};',
  '  try {',
  '    data = text ? JSON.parse(text) : {};',
  '  } catch {',
  '    data = {};',
  '  }',
  '  if (data && data.success === false) {',
  "    const message = String(data.message ?? '');",
  '    if (MAX_NOT_FOUND_PATTERN.test(message)) return;',
  '    throw new Error(`Max DELETE /${path} failed: ${message || text}`);',
  '  }',
  '};',
].join('\n');

/**
 * Removes a member from a group chat or channel; `block` (default true) also bans them. Needs a chat-admin bot with
 * the `add_remove_members` right; `block` only takes effect in chats with an invite link.
 */
export const maxRemoveMemberAction: IActionDescriptor = {
  name: MAX_REMOVE_MEMBER_NAME,
  label: 'max:action.removeMember',
  fields: [
    { name: 'credentialId', label: 'max:field.bot', kind: 'credential-ref', vendor: MAX_VENDOR },
    { name: 'chatId', label: 'max:field.chatId', kind: 'expression', expectedType: anyNumber },
    { name: 'userId', label: 'max:field.userId', kind: 'expression', expectedType: anyNumber },
    {
      name: 'block',
      label: 'max:field.block',
      kind: 'expression',
      expectedType: { type: 'boolean' },
      defaultValue: 'true',
    },
  ],
  emit: (fields) =>
    `await maxRemoveMember(${fields.credentialId}, ${fields.chatId}, ${fields.userId}, ${fields.block});`,
  activitySignature:
    'maxRemoveMember(credentialId: string, chatId: number, userId: number, block: boolean): Promise<void>',
  activityCode: [
    'export const maxRemoveMember = async (',
    '  credentialId: string,',
    '  chatId: number,',
    '  userId: number,',
    '  block: boolean,',
    '): Promise<void> => {',
    '  const bot = await resolveMaxBotToken(credentialId);',
    '  await maxModerationDelete(bot, `chats/${chatId}/members`, { user_id: userId, block });',
    '};',
  ].join('\n'),
  activityOptions: MODERATION_ACTIVITY_OPTIONS,
};

/** Deletes a message by its `mid`. Needs the `delete` admin right (in a dialog the bot can delete only its own messages); MAX allows ~2 deletions/s per chat. */
export const maxDeleteMessageAction: IActionDescriptor = {
  name: MAX_DELETE_MESSAGE_NAME,
  label: 'max:action.deleteMessage',
  fields: [
    { name: 'credentialId', label: 'max:field.bot', kind: 'credential-ref', vendor: MAX_VENDOR },
    { name: 'messageId', label: 'max:field.messageId', kind: 'expression', expectedType: { type: 'string' } },
  ],
  emit: (fields) => `await maxDeleteMessage(${fields.credentialId}, ${fields.messageId});`,
  activitySignature: 'maxDeleteMessage(credentialId: string, messageId: string): Promise<void>',
  activityCode: [
    'export const maxDeleteMessage = async (credentialId: string, messageId: string): Promise<void> => {',
    '  const bot = await resolveMaxBotToken(credentialId);',
    "  await maxModerationDelete(bot, 'messages', { message_id: messageId });",
    '};',
  ].join('\n'),
  activityOptions: MODERATION_ACTIVITY_OPTIONS,
};

import type { IFieldConfig } from '@falang/workflow-integrations-common';

/**
 * Who a MAX send action addresses: `POST /messages` takes either `chat_id` (a dialog, group or channel) or `user_id`
 * (a user — MAX opens the dialog itself). A private dialog's chat id is not the user's id, so a bot that only stored
 * `message.from.id` sends by user.
 */
export type TMaxRecipient = 'chat' | 'user';

export const MAX_RECIPIENT_FIELD: IFieldConfig = {
  name: 'recipient',
  label: 'max:field.recipient',
  help: 'max:help.recipient',
  kind: 'select',
  options: [
    { value: 'chat', label: 'max:recipient.chat' },
    { value: 'user', label: 'max:recipient.user' },
  ],
  // A node saved before this field existed has no value and keeps sending to the chat; a new node starts on "user".
  defaultValue: 'chat',
  newNodeValue: 'user',
  agentNotes:
    'Always set it. "user": `chatId` is a user id (`message.from.id`, `event.user.id`, a user id stored in a table) — MAX sends to that user\'s dialog with the bot. "chat": `chatId` is a chat id (`message.chat.id`, a group or channel id); an omitted value means "chat".',
};

/** The id the `recipient` field addresses — a chat id or a user id. */
export const MAX_RECIPIENT_ID_FIELD: IFieldConfig = {
  name: 'chatId',
  label: 'max:field.recipientId',
  help: 'max:help.recipientId',
  kind: 'expression',
  expectedType: { type: 'number', numberType: { type: 'any' } },
};

/**
 * The emitted argument for the `recipient` field. `resolveFieldExpression` JSON-stringifies a `select` value, an unset
 * one arrives as `'""'`, and a node saved before the field existed has no key at all — both mean `'chat'`.
 */
export const emitMaxRecipient = (value: string | undefined): string =>
  value === '"user"' || value === "'user'" ? "'user'" : "'chat'";

/** Activity-side helper: the `POST /messages` query for a recipient. */
export const MAX_RECIPIENT_QUERY_CODE = [
  'const maxRecipientQuery = (recipient: string, id: number): Record<string, number> =>',
  "  recipient === 'user' ? { user_id: id } : { chat_id: id };",
].join('\n');

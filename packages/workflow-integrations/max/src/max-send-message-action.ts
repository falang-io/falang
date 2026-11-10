import {
  emitMessageSend,
  MESSAGE_SEND_RESULT_TS_TYPE,
  type IActionDescriptor,
} from '@falang/workflow-integrations-common';
import { MAX_SEND_MESSAGE_NAME, MAX_VENDOR } from './constants.js';
import { MAX_RECIPIENT_FIELD, MAX_RECIPIENT_ID_FIELD, emitMaxRecipient } from './max-recipient.js';
import { MAX_SEND_RESULT_FIELD, MAX_SEND_RESULT_TYPE } from './max-send-result.js';

/** "Send message": a plain text message to a chat or a user; reports `{ success, disabled }` (see `max-send-result.ts`). */
export const maxSendMessageAction: IActionDescriptor = {
  name: MAX_SEND_MESSAGE_NAME,
  label: 'max:action.sendMessage',
  fields: [
    { name: 'credentialId', label: 'max:field.bot', kind: 'credential-ref', vendor: MAX_VENDOR },
    MAX_RECIPIENT_FIELD,
    MAX_RECIPIENT_ID_FIELD,
    { name: 'text', label: 'max:field.text', kind: 'template-string' },
    MAX_SEND_RESULT_FIELD,
  ],
  resultType: MAX_SEND_RESULT_TYPE,
  emit: (fields) =>
    emitMessageSend(
      fields,
      `await maxSendMessage(${fields.credentialId}, ${fields.chatId}, ${fields.text}, ${emitMaxRecipient(fields.recipient)})`,
    ),
  activitySignature: `maxSendMessage(credentialId: string, chatId: number, text: string, recipient: string): Promise<${MESSAGE_SEND_RESULT_TS_TYPE}>`,
  journal: { kind: 'message-out', args: ['chatId', 'recipient', 'text'] },
  activityCode: [
    'export const maxSendMessage = async (',
    '  credentialId: string,',
    '  chatId: number,',
    '  text: string,',
    "  recipient: string = 'chat',",
    `): Promise<${MESSAGE_SEND_RESULT_TS_TYPE}> =>`,
    '  maxSendGuarded(async () => {',
    '    const bot = await resolveMaxBotToken(credentialId);',
    "    await maxApiRequest(bot, 'POST', 'messages', maxRecipientQuery(recipient, chatId), { text });",
    '  });',
  ].join('\n'),
};

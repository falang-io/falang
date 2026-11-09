import type { TVariableInfo } from '@falang/typescript-dto';
import {
  buildPrepareButtonsActivityCode,
  MESSAGE_BUTTON_COMMAND_PREFIX,
  MESSAGE_BUTTON_TS_TYPE,
  type IActionDescriptor,
  emitMessageSend,
  MESSAGE_SEND_RESULT_TS_TYPE,
} from '@falang/workflow-integrations-common';
import { MAX_SEND_BUTTONS_NAME, MAX_VENDOR } from './constants.js';
import { MAX_SEND_RESULT_FIELD, MAX_SEND_RESULT_TYPE } from './max-send-result.js';
import { MAX_RECIPIENT_FIELD, emitMaxRecipient } from './max-recipient.js';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

/** MAX's limit on a callback button's `payload`, in characters — the command prefix counts too. */
const CALLBACK_PAYLOAD_MAX_LENGTH = 1024;

/** Shared activity helper (see `MAX_SHARED_ACTIVITY_CODE`). */
export const MAX_PREPARE_BUTTONS_CODE = buildPrepareButtonsActivityCode('maxPrepareButtons');

/**
 * "Send message with buttons": a text message with an `inline_keyboard` attachment, one button per row — a `url`
 * button is a `link` button, a `command` button a `callback` button whose payload is `falang-cmd:<command>`, which
 * `max-backend.ts` turns into a `/command` message from the presser. Never waits for a press, unlike `max-question`.
 */
export const maxSendButtonsAction: IActionDescriptor = {
  name: MAX_SEND_BUTTONS_NAME,
  label: 'max:action.sendButtons',
  editorType: 'sidebar',
  fields: [
    { name: 'credentialId', label: 'max:field.bot', kind: 'credential-ref', vendor: MAX_VENDOR },
    MAX_RECIPIENT_FIELD,
    { name: 'chatId', label: 'max:field.recipientId', kind: 'expression', expectedType: anyNumber, fieldSize: 'small' },
    { name: 'text', label: 'max:field.text', kind: 'template-string' },
    { name: 'buttons', label: 'max:field.buttons', help: 'max:help.buttons', kind: 'buttons', defaultValue: '[]' },
    MAX_SEND_RESULT_FIELD,
  ],
  resultType: MAX_SEND_RESULT_TYPE,
  emit: (fields) =>
    emitMessageSend(
      fields,
      `await maxSendButtons(${fields.credentialId}, ${fields.chatId}, ${fields.text}, ${fields.buttons}, ${emitMaxRecipient(fields.recipient)})`,
    ),
  activitySignature: `maxSendButtons(credentialId: string, chatId: number, text: string, buttons: readonly ${MESSAGE_BUTTON_TS_TYPE}[], recipient: string): Promise<${MESSAGE_SEND_RESULT_TS_TYPE}>`,
  journal: { kind: 'message-out', args: ['chatId', 'recipient', 'text', 'buttons'] },
  activityCode: [
    'export const maxSendButtons = async (',
    '  credentialId: string,',
    '  chatId: number,',
    '  text: string,',
    `  buttons: readonly ${MESSAGE_BUTTON_TS_TYPE}[],`,
    "  recipient: string = 'chat',",
    `): Promise<${MESSAGE_SEND_RESULT_TS_TYPE}> =>`,
    '  maxSendGuarded(async () => {',
    '    const rows = maxPrepareButtons(buttons).map((button) => {',
    "      if (button.kind === 'url') return [{ type: 'link', text: button.text, url: button.value }];",
    `      const payload = ${JSON.stringify(MESSAGE_BUTTON_COMMAND_PREFIX)} + button.value;`,
    `      if (payload.length > ${CALLBACK_PAYLOAD_MAX_LENGTH}) {`,
    `        throw new Error(\`The command of button "\${button.text}" is too long for MAX (at most ${CALLBACK_PAYLOAD_MAX_LENGTH - MESSAGE_BUTTON_COMMAND_PREFIX.length} characters)\`);`,
    '      }',
    "      return [{ type: 'callback', text: button.text, payload }];",
    '    });',
    '    const bot = await resolveMaxBotToken(credentialId);',
    "    const attachments = rows.length > 0 ? [{ type: 'inline_keyboard', payload: { buttons: rows } }] : [];",
    "    await maxApiRequest(bot, 'POST', 'messages', maxRecipientQuery(recipient, chatId), { text, attachments });",
    '  });',
  ].join('\n'),
};

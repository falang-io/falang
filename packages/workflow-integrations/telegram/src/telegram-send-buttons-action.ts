import type { TVariableInfo } from '@falang/typescript-dto';
import {
  buildPrepareButtonsActivityCode,
  emitMessageSend,
  MESSAGE_BUTTON_COMMAND_PREFIX,
  MESSAGE_SEND_RESULT_TS_TYPE,
  MESSAGE_BUTTON_TS_TYPE,
  type IActionDescriptor,
} from '@falang/workflow-integrations-common';
import { TELEGRAM_SEND_BUTTONS_NAME, TELEGRAM_VENDOR } from './constants.js';
import { TELEGRAM_SEND_RESULT_FIELD, TELEGRAM_SEND_RESULT_TYPE } from './telegram-send-result.js';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

/** Telegram's limit on `callback_data`, in bytes — the command prefix counts too. */
const CALLBACK_DATA_MAX_BYTES = 64;

/** Shared activity helper (see `sharedActivityCode` in `telegram.integration.ts`). */
export const TELEGRAM_PREPARE_BUTTONS_CODE = buildPrepareButtonsActivityCode('telegramPrepareButtons');

/**
 * "Send message with buttons": a text message with an inline keyboard, one button per row — a `url` button opens a
 * link, a `command` button carries `falang-cmd:<command>` as `callback_data`, which `telegram-backend.ts` turns into a
 * `/command` message from the presser (so an on-command trigger runs). Never waits for a press, unlike
 * `telegram-question`.
 */
export const telegramSendButtonsAction: IActionDescriptor = {
  name: TELEGRAM_SEND_BUTTONS_NAME,
  label: 'telegram:action.sendButtons',
  editorType: 'sidebar',
  fields: [
    { name: 'credentialId', label: 'telegram:field.bot', kind: 'credential-ref', vendor: TELEGRAM_VENDOR },
    { name: 'chatId', label: 'telegram:field.chatId', kind: 'expression', expectedType: anyNumber, fieldSize: 'small' },
    { name: 'text', label: 'telegram:field.text', kind: 'template-string' },
    {
      name: 'buttons',
      label: 'telegram:field.buttons',
      help: 'telegram:help.buttons',
      agentNotes:
        'Telegram limits a command button: "falang-cmd:" plus the command must fit in 64 bytes, so keep commands short.',
      kind: 'buttons',
      defaultValue: '[]',
    },
    TELEGRAM_SEND_RESULT_FIELD,
  ],
  resultType: TELEGRAM_SEND_RESULT_TYPE,
  emit: (fields) =>
    emitMessageSend(
      fields,
      `await telegramSendButtons(${fields.credentialId}, ${fields.chatId}, ${fields.text}, ${fields.buttons})`,
    ),
  activitySignature: `telegramSendButtons(credentialId: string, chatId: number, text: string, buttons: readonly ${MESSAGE_BUTTON_TS_TYPE}[]): Promise<${MESSAGE_SEND_RESULT_TS_TYPE}>`,
  journal: { kind: 'message-out', args: ['chatId', 'text', 'buttons'] },
  activityCode: [
    'export const telegramSendButtons = async (',
    '  credentialId: string,',
    '  chatId: number,',
    '  text: string,',
    `  buttons: readonly ${MESSAGE_BUTTON_TS_TYPE}[],`,
    `): Promise<${MESSAGE_SEND_RESULT_TS_TYPE}> =>`,
    '  telegramSendGuarded(async () => {',
    '    const inlineKeyboard = telegramPrepareButtons(buttons).map((button) => {',
    "      if (button.kind === 'url') return [{ text: button.text, url: button.value }];",
    `      const data = ${JSON.stringify(MESSAGE_BUTTON_COMMAND_PREFIX)} + button.value;`,
    `      if (Buffer.byteLength(data, 'utf8') > ${CALLBACK_DATA_MAX_BYTES}) {`,
    `        throw new Error(\`The command "\${button.value}" of button "\${button.text}" is too long for Telegram (at most ${CALLBACK_DATA_MAX_BYTES - MESSAGE_BUTTON_COMMAND_PREFIX.length} bytes)\`);`,
    '      }',
    '      return [{ text: button.text, callback_data: data }];',
    '    });',
    '    const { token: botToken, apiBaseUrl } = await resolveTelegramBotToken(credentialId);',
    '    const body =',
    '      inlineKeyboard.length > 0',
    '        ? { chat_id: chatId, text, reply_markup: { inline_keyboard: inlineKeyboard } }',
    '        : { chat_id: chatId, text };',
    '    const response = await fetch(`${apiBaseUrl}/bot${botToken}/sendMessage`, {',
    "      method: 'POST',",
    "      headers: { 'Content-Type': 'application/json' },",
    '      body: JSON.stringify(body),',
    '    });',
    '    if (!response.ok) {',
    '      throw new Error(`Telegram sendMessage (buttons) failed: ${response.status} ${await response.text()}`);',
    '    }',
    '  });',
  ].join('\n'),
};

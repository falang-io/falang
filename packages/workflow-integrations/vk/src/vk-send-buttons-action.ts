import type { TVariableInfo } from '@falang/typescript-dto';
import {
  buildPrepareButtonsActivityCode,
  MESSAGE_BUTTON_TS_TYPE,
  type IActionDescriptor,
  emitMessageSend,
  MESSAGE_SEND_RESULT_TS_TYPE,
} from '@falang/workflow-integrations-common';
import { VK_BUTTON_COMMAND_PAYLOAD_KEY, VK_SEND_BUTTONS_NAME, VK_VENDOR } from './constants.js';
import { VK_SEND_RESULT_FIELD, VK_SEND_RESULT_TYPE } from './vk-send-result.js';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

/** VK limits: a label is at most 40 characters, a payload 255 characters of JSON, an inline keyboard 6 rows. */
const VK_BUTTON_LABEL_LIMIT = 40;
const VK_PAYLOAD_LIMIT = 255;
const VK_INLINE_ROWS = 6;

/** Shared activity helper (see `VK_SHARED_ACTIVITY_CODE`). */
export const VK_PREPARE_BUTTONS_CODE = buildPrepareButtonsActivityCode('vkPrepareButtons');

/**
 * "Send message with buttons": a message with an inline keyboard — a `url` button is `open_link`, a `command` button a
 * `callback` button with payload `{"falangCommand":"<command>"}`, which `vk-backend.ts` turns into a `/command` message
 * from the presser. One button per row up to six, two per row beyond that (an inline keyboard holds six rows). Never
 * waits for a press, unlike `vk-question`.
 */
export const vkSendButtonsAction: IActionDescriptor = {
  name: VK_SEND_BUTTONS_NAME,
  label: 'vk:action.sendButtons',
  editorType: 'sidebar',
  fields: [
    { name: 'credentialId', label: 'vk:field.bot', kind: 'credential-ref', vendor: VK_VENDOR },
    {
      name: 'chatId',
      label: 'vk:field.chatId',
      help: 'vk:help.chatId',
      kind: 'expression',
      expectedType: anyNumber,
      fieldSize: 'small',
    },
    { name: 'text', label: 'vk:field.text', kind: 'template-string' },
    {
      name: 'buttons',
      label: 'vk:field.buttons',
      help: 'vk:help.buttons',
      agentNotes: `VK cuts a button caption to ${VK_BUTTON_LABEL_LIMIT} characters.`,
      kind: 'buttons',
      defaultValue: '[]',
    },
    VK_SEND_RESULT_FIELD,
  ],
  resultType: VK_SEND_RESULT_TYPE,
  emit: (fields) =>
    emitMessageSend(
      fields,
      `await vkSendButtons(${fields.credentialId}, ${fields.chatId}, ${fields.text}, ${fields.buttons})`,
    ),
  activitySignature: `vkSendButtons(credentialId: string, chatId: number, text: string, buttons: readonly ${MESSAGE_BUTTON_TS_TYPE}[]): Promise<${MESSAGE_SEND_RESULT_TS_TYPE}>`,
  journal: { kind: 'message-out', args: ['chatId', 'text', 'buttons'] },
  activityCode: [
    'export const vkSendButtons = async (',
    '  credentialId: string,',
    '  chatId: number,',
    '  text: string,',
    `  buttons: readonly ${MESSAGE_BUTTON_TS_TYPE}[],`,
    `): Promise<${MESSAGE_SEND_RESULT_TS_TYPE}> =>`,
    '  vkSendGuarded(async () => {',
    '    const prepared = vkPrepareButtons(buttons);',
    `    const perRow = prepared.length <= ${VK_INLINE_ROWS} ? 1 : 2;`,
    '    const rows: unknown[][] = [];',
    '    prepared.forEach((button, index) => {',
    `      const label = button.text.slice(0, ${VK_BUTTON_LABEL_LIMIT});`,
    '      let action: Record<string, string>;',
    "      if (button.kind === 'url') {",
    "        action = { type: 'open_link', link: button.value, label };",
    '      } else {',
    `        const payload = JSON.stringify({ ${VK_BUTTON_COMMAND_PAYLOAD_KEY}: button.value });`,
    `        if (payload.length > ${VK_PAYLOAD_LIMIT}) {`,
    '          throw new Error(`The command of button "${button.text}" is too long for VK`);',
    '        }',
    "        action = { type: 'callback', label, payload };",
    '      }',
    '      if (index % perRow === 0) rows.push([{ action }]);',
    '      else rows[rows.length - 1].push({ action });',
    '    });',
    '    const bot = await resolveVkAccessToken(credentialId);',
    '    await vkSendText(bot, chatId, text, rows.length > 0 ? { keyboard: { inline: true, buttons: rows } } : {});',
    '  });',
  ].join('\n'),
};

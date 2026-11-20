import type { TVariableInfo } from '@falang/typescript-dto';
import {
  buildButtonWaitQuestion,
  buildButtonWaitRegistryActivityCode,
  MESSAGE_BUTTON_TS_TYPE,
  MESSAGE_BUTTON_WAIT_PREFIX,
  type IQuestionDescriptor,
} from '@falang/workflow-integrations-common';
import {
  VK_ASK_BUTTONS_NAME,
  VK_BUTTON_ANSWER_SIGNAL_NAME,
  VK_BUTTON_ANSWER_TYPE_ID,
  VK_BUTTON_WAIT_PAYLOAD_KEY,
  VK_VENDOR,
} from './constants.js';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };
const VK_BUTTON_LABEL_LIMIT = 40;
const VK_PAYLOAD_LIMIT = 255;
const VK_INLINE_ROWS = 6;

export const VK_BUTTON_WAIT_REGISTRY_CODE = buildButtonWaitRegistryActivityCode(VK_VENDOR, 'vk');

export const vkAskButtonsQuestion: IQuestionDescriptor = buildButtonWaitQuestion({
  name: VK_ASK_BUTTONS_NAME,
  label: 'vk:question.askButtons',
  answerSignalName: VK_BUTTON_ANSWER_SIGNAL_NAME,
  answerType: { type: 'struct', id: VK_BUTTON_ANSWER_TYPE_ID },
  contextFields: [
    { name: 'credentialId', label: 'vk:field.bot', kind: 'credential-ref', vendor: VK_VENDOR },
    { name: 'chatId', label: 'vk:field.chatId', kind: 'expression', expectedType: anyNumber, fieldSize: 'small' },
  ],
  textLabel: 'vk:field.text',
  buttonsLabel: 'vk:field.buttons',
  buttonsHelp: 'vk:help.askButtons',
  timeoutLabel: 'vk:field.timeout',
  timeoutHelp: 'vk:help.askButtonsTimeout',
  answerVariableLabel: 'vk:field.answerVariable',
  answerVariableHelp: 'vk:help.answerVariable',
  journal: { kind: 'message-out', args: ['chatId', 'text', 'buttons'] },
  askActivitySignature: `vkAskButtons(credentialId: string, chatId: number, text: string, buttons: readonly ${MESSAGE_BUTTON_TS_TYPE}[], timeoutMs: number): Promise<{ messageId: string; waitId: string }>`,
  askActivityCode: [
    'export const vkAskButtons = async (',
    '  credentialId: string, chatId: number, text: string,',
    `  buttons: readonly ${MESSAGE_BUTTON_TS_TYPE}[], timeoutMs: number,`,
    '): Promise<{ messageId: string; waitId: string }> => {',
    '  const info = vkButtonWaitActivityContext.current().info;',
    '  const execution = info.workflowExecution;',
    "  if (!execution) throw new Error('A button wait can only be registered from a workflow activity');",
    '  const waitId = `${execution.runId}:${info.activityId}`;',
    '  const prepared = vkPrepareButtons(buttons);',
    `  const perRow = prepared.length <= ${VK_INLINE_ROWS} ? 1 : 2;`,
    '  const rows: unknown[][] = [];',
    '  prepared.forEach((button, index) => {',
    `    const label = button.text.slice(0, ${VK_BUTTON_LABEL_LIMIT});`,
    '    let action: Record<string, string>;',
    "    if (button.kind === 'url') {",
    "      action = { type: 'open_link', link: button.value, label };",
    '    } else {',
    `      const payload = JSON.stringify({ ${VK_BUTTON_WAIT_PAYLOAD_KEY}: ${JSON.stringify(MESSAGE_BUTTON_WAIT_PREFIX)} + waitId + ':' + index });`,
    `      if (payload.length > ${VK_PAYLOAD_LIMIT}) throw new Error('The button wait id is too long for VK');`,
    "      action = { type: 'callback', label, payload };",
    '    }',
    `    if (index % perRow === 0) rows.push([{ action }]);`,
    '    else rows[rows.length - 1].push({ action });',
    '  });',
    '  const bot = await resolveVkAccessToken(credentialId);',
    "  const sent = await vkApiCall(bot, 'messages.send', {",
    '    peer_ids: String(chatId), random_id: vkRandomId(), message: text,',
    '    keyboard: { inline: true, buttons: rows },',
    '  });',
    '  const item = sent[0];',
    '  if (item?.error) throw new Error(`VK messages.send failed: ${JSON.stringify(item.error)}`);',
    '  const messageId = String(item.conversation_message_id);',
    '  await vkRegisterButtonWait(waitId, credentialId, chatId, messageId, timeoutMs);',
    '  return { messageId, waitId };',
    '};',
  ].join('\n'),
  resolveActivitySignature:
    'vkResolveButtonsAnswer(credentialId: string, chatId: number, messageId: string, selectedLabel: string): Promise<void>',
  resolveActivityCode: [
    'export const vkResolveButtonsAnswer = async (',
    '  credentialId: string, chatId: number, messageId: string, selectedLabel: string,',
    '): Promise<void> => {',
    '  await vkResolveQuestionAnswer(credentialId, chatId, messageId, selectedLabel);',
    '};',
  ].join('\n'),
  closeActivitySignature:
    'vkCloseButtonsQuestion(credentialId: string, chatId: number, messageId: string, waitId: string, reason: string): Promise<void>',
  closeActivityCode: [
    'export const vkCloseButtonsQuestion = async (',
    '  credentialId: string, chatId: number, messageId: string, waitId: string, reason: string,',
    '): Promise<void> => {',
    '  await vkReleaseButtonWait(waitId);',
    '  await vkCloseQuestion(credentialId, chatId, messageId, reason);',
    '};',
  ].join('\n'),
});

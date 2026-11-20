import type { TVariableInfo } from '@falang/typescript-dto';
import {
  buildButtonWaitQuestion,
  buildButtonWaitRegistryActivityCode,
  MESSAGE_BUTTON_TS_TYPE,
  MESSAGE_BUTTON_WAIT_PREFIX,
  type IQuestionDescriptor,
} from '@falang/workflow-integrations-common';
import {
  TELEGRAM_ASK_BUTTONS_NAME,
  TELEGRAM_BUTTON_ANSWER_SIGNAL_NAME,
  TELEGRAM_BUTTON_ANSWER_TYPE_ID,
  TELEGRAM_VENDOR,
} from './constants.js';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };
const CALLBACK_DATA_MAX_BYTES = 64;

export const TELEGRAM_BUTTON_WAIT_REGISTRY_CODE = buildButtonWaitRegistryActivityCode(TELEGRAM_VENDOR, 'telegram');

export const telegramAskButtonsQuestion: IQuestionDescriptor = buildButtonWaitQuestion({
  name: TELEGRAM_ASK_BUTTONS_NAME,
  label: 'telegram:question.askButtons',
  answerSignalName: TELEGRAM_BUTTON_ANSWER_SIGNAL_NAME,
  answerType: { type: 'struct', id: TELEGRAM_BUTTON_ANSWER_TYPE_ID },
  contextFields: [
    { name: 'credentialId', label: 'telegram:field.bot', kind: 'credential-ref', vendor: TELEGRAM_VENDOR },
    { name: 'chatId', label: 'telegram:field.chatId', kind: 'expression', expectedType: anyNumber, fieldSize: 'small' },
  ],
  textLabel: 'telegram:field.text',
  buttonsLabel: 'telegram:field.buttons',
  buttonsHelp: 'telegram:help.askButtons',
  timeoutLabel: 'telegram:field.timeout',
  timeoutHelp: 'telegram:help.askButtonsTimeout',
  answerVariableLabel: 'telegram:field.answerVariable',
  answerVariableHelp: 'telegram:help.answerVariable',
  journal: { kind: 'message-out', args: ['chatId', 'text', 'buttons'] },
  askActivitySignature: `telegramAskButtons(credentialId: string, chatId: number, text: string, buttons: readonly ${MESSAGE_BUTTON_TS_TYPE}[], timeoutMs: number): Promise<{ messageId: string; waitId: string }>`,
  askActivityCode: [
    'export const telegramAskButtons = async (',
    '  credentialId: string,',
    '  chatId: number,',
    '  text: string,',
    `  buttons: readonly ${MESSAGE_BUTTON_TS_TYPE}[],`,
    '  timeoutMs: number,',
    '): Promise<{ messageId: string; waitId: string }> => {',
    '  const info = telegramButtonWaitActivityContext.current().info;',
    '  const execution = info.workflowExecution;',
    "  if (!execution) throw new Error('A button wait can only be registered from a workflow activity');",
    '  const waitId = `${execution.runId}:${info.activityId}`;',
    '  const inlineKeyboard = telegramPrepareButtons(buttons).map((button, index) => {',
    "    if (button.kind === 'url') return [{ text: button.text, url: button.value }];",
    `    const data = ${JSON.stringify(MESSAGE_BUTTON_WAIT_PREFIX)} + waitId + ':' + index;`,
    `    if (Buffer.byteLength(data, 'utf8') > ${CALLBACK_DATA_MAX_BYTES}) throw new Error('The button wait id is too long for Telegram');`,
    '    return [{ text: button.text, callback_data: data }];',
    '  });',
    '  const { token: botToken, apiBaseUrl } = await resolveTelegramBotToken(credentialId);',
    '  const response = await fetch(`${apiBaseUrl}/bot${botToken}/sendMessage`, {',
    "    method: 'POST',",
    "    headers: { 'Content-Type': 'application/json' },",
    '    body: JSON.stringify({ chat_id: chatId, text, reply_markup: { inline_keyboard: inlineKeyboard } }),',
    '  });',
    '  if (!response.ok) throw new Error(`Telegram sendMessage (ask buttons) failed: ${response.status} ${await response.text()}`);',
    '  const data = (await response.json()) as { result: { message_id: number } };',
    '  const messageId = String(data.result.message_id);',
    '  await telegramRegisterButtonWait(waitId, credentialId, chatId, messageId, timeoutMs);',
    '  return { messageId, waitId };',
    '};',
  ].join('\n'),
  resolveActivitySignature:
    'telegramResolveButtonsAnswer(credentialId: string, chatId: number, messageId: string, selectedLabel: string): Promise<void>',
  resolveActivityCode: [
    'export const telegramResolveButtonsAnswer = async (',
    '  credentialId: string, chatId: number, messageId: string, selectedLabel: string,',
    '): Promise<void> => {',
    '  await telegramResolveQuestionAnswer(credentialId, chatId, messageId, selectedLabel);',
    '};',
  ].join('\n'),
  closeActivitySignature:
    'telegramCloseButtonsQuestion(credentialId: string, chatId: number, messageId: string, waitId: string, reason: string): Promise<void>',
  closeActivityCode: [
    'export const telegramCloseButtonsQuestion = async (',
    '  credentialId: string, chatId: number, messageId: string, waitId: string, reason: string,',
    '): Promise<void> => {',
    '  await telegramReleaseButtonWait(waitId);',
    '  await telegramCloseQuestion(credentialId, chatId, messageId, reason);',
    '};',
  ].join('\n'),
});

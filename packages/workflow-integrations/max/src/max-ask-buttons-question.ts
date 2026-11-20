import {
  buildButtonWaitQuestion,
  buildButtonWaitRegistryActivityCode,
  MESSAGE_BUTTON_TS_TYPE,
  MESSAGE_BUTTON_WAIT_PREFIX,
  type IQuestionDescriptor,
} from '@falang/workflow-integrations-common';
import {
  MAX_ASK_BUTTONS_NAME,
  MAX_BUTTON_ANSWER_SIGNAL_NAME,
  MAX_BUTTON_ANSWER_TYPE_ID,
  MAX_VENDOR,
} from './constants.js';
import { MAX_RECIPIENT_FIELD, MAX_RECIPIENT_ID_FIELD } from './max-recipient.js';

export const MAX_BUTTON_WAIT_REGISTRY_CODE = buildButtonWaitRegistryActivityCode(MAX_VENDOR, 'max');

export const maxAskButtonsQuestion: IQuestionDescriptor = buildButtonWaitQuestion({
  name: MAX_ASK_BUTTONS_NAME,
  label: 'max:question.askButtons',
  answerSignalName: MAX_BUTTON_ANSWER_SIGNAL_NAME,
  answerType: { type: 'struct', id: MAX_BUTTON_ANSWER_TYPE_ID },
  contextFields: [
    { name: 'credentialId', label: 'max:field.bot', kind: 'credential-ref', vendor: MAX_VENDOR },
    MAX_RECIPIENT_FIELD,
    { ...MAX_RECIPIENT_ID_FIELD, fieldSize: 'small' },
  ],
  textLabel: 'max:field.text',
  buttonsLabel: 'max:field.buttons',
  buttonsHelp: 'max:help.askButtons',
  timeoutLabel: 'max:field.timeout',
  timeoutHelp: 'max:help.askButtonsTimeout',
  answerVariableLabel: 'max:field.answerVariable',
  answerVariableHelp: 'max:help.answerVariable',
  journal: { kind: 'message-out', args: ['chatId', 'recipient', 'text', 'buttons'] },
  askActivitySignature: `maxAskButtons(credentialId: string, recipient: string, chatId: number, text: string, buttons: readonly ${MESSAGE_BUTTON_TS_TYPE}[], timeoutMs: number): Promise<{ messageId: string; waitId: string }>`,
  askActivityCode: [
    'export const maxAskButtons = async (',
    '  credentialId: string, recipient: string, chatId: number, text: string,',
    `  buttons: readonly ${MESSAGE_BUTTON_TS_TYPE}[], timeoutMs: number,`,
    '): Promise<{ messageId: string; waitId: string }> => {',
    '  const info = maxButtonWaitActivityContext.current().info;',
    '  const execution = info.workflowExecution;',
    "  if (!execution) throw new Error('A button wait can only be registered from a workflow activity');",
    '  const waitId = `${execution.runId}:${info.activityId}`;',
    '  const rows = maxPrepareButtons(buttons).map((button, index) => {',
    "    if (button.kind === 'url') return [{ type: 'link', text: button.text, url: button.value }];",
    `    const payload = ${JSON.stringify(MESSAGE_BUTTON_WAIT_PREFIX)} + waitId + ':' + index;`,
    "    return [{ type: 'callback', text: button.text, payload }];",
    '  });',
    '  const bot = await resolveMaxBotToken(credentialId);',
    "  const data = await maxApiRequest(bot, 'POST', 'messages', maxRecipientQuery(recipient, chatId), {",
    "    text, attachments: [{ type: 'inline_keyboard', payload: { buttons: rows } }],",
    '  });',
    '  const messageId = String(data.message.body.mid);',
    '  await maxRegisterButtonWait(waitId, credentialId, chatId, messageId, timeoutMs);',
    '  return { messageId, waitId };',
    '};',
  ].join('\n'),
  resolveActivitySignature:
    'maxResolveButtonsAnswer(credentialId: string, recipient: string, chatId: number, messageId: string, selectedLabel: string): Promise<void>',
  resolveActivityCode: [
    'export const maxResolveButtonsAnswer = async (',
    '  credentialId: string, recipient: string, chatId: number, messageId: string, selectedLabel: string,',
    '): Promise<void> => {',
    '  await maxResolveQuestionAnswer(credentialId, recipient, chatId, messageId, selectedLabel);',
    '};',
  ].join('\n'),
  closeActivitySignature:
    'maxCloseButtonsQuestion(credentialId: string, recipient: string, chatId: number, messageId: string, waitId: string, reason: string): Promise<void>',
  closeActivityCode: [
    'export const maxCloseButtonsQuestion = async (',
    '  credentialId: string, recipient: string, chatId: number, messageId: string, waitId: string, reason: string,',
    '): Promise<void> => {',
    '  await maxReleaseButtonWait(waitId);',
    '  await maxCloseQuestion(credentialId, recipient, chatId, messageId, reason);',
    '};',
  ].join('\n'),
});

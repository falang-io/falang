import type { TVariableInfo } from '@falang/typescript-dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import {
  MAX_COMMAND_FIELD_NAME,
  MAX_MESSAGE_TYPE_ID,
  MAX_ON_COMMAND_TRIGGER_NAME,
  MAX_QUESTION_ANSWER_SIGNAL_NAME,
  MAX_QUESTION_NAME,
  MAX_SCOPE_VARIABLE_NAME,
  MAX_SEND_MESSAGE_NAME,
  MAX_SIGNAL_NAME,
  MAX_TRIGGER_NAME,
  MAX_VENDOR,
} from './constants.js';
import { registerMaxBackend } from './max-backend.js';
import { maxSendFileAction } from './max-send-file-action.js';
import { MAX_SHARED_ACTIVITY_CODE } from './max-shared-activity-code.js';
import { maxStructTypes } from './max-struct-types.js';

export * from './constants.js';
export { maxStructTypes } from './max-struct-types.js';

/** Run-journal line for both triggers (ADR 0059 (private)): the message text, or a marker for media-only messages. */
const MAX_JOURNAL_MESSAGE = "${message.text ?? '[no text]'}";

const MAX_WEBHOOK_PATH = '/webhooks/max/:projectId/:credentialId/:env';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

const maxMessageScopeType: TVariableInfo = { type: 'struct', id: MAX_MESSAGE_TYPE_ID };

/**
 * The Max messenger (`https://max.ru`, Bot API `https://dev.max.ru/docs-api`) — the same shape as the Telegram
 * integration: on-message and on-command triggers, send message / send file, and a question with inline-keyboard
 * buttons. Bot tokens are resolved in the runner through the backend's internal credential resolver, like Telegram's.
 */
export const maxIntegration: IWorkflowIntegration = {
  vendor: MAX_VENDOR,
  label: 'max:label',
  notes:
    'MAX messenger bots (Russian messenger MAX / Макс, chat bot): receive incoming messages and /commands, send text messages and files, and ask questions with inline-keyboard buttons (yes/no, multiple choice) that pause the workflow until the user taps one. Works like the Telegram integration.',
  locales: {
    en: () => import('./locales/en.json'),
    ru: () => import('./locales/ru.json'),
  },
  credentialFields: [{ name: 'botToken', label: 'max:credentialField.botToken', kind: 'secret' }],
  types: maxStructTypes,
  triggers: [
    {
      name: MAX_TRIGGER_NAME,
      label: 'max:trigger.onMessage',
      scopeType: maxMessageScopeType,
      scopeVariableName: MAX_SCOPE_VARIABLE_NAME,
      signalName: MAX_SIGNAL_NAME,
      webhookPath: MAX_WEBHOOK_PATH,
      journalMessage: MAX_JOURNAL_MESSAGE,
      notes: [
        'Fires for every incoming message to this MAX bot, commands included — there is no way to filter which',
        'messages reach this trigger from here. To react to a specific slash command (e.g. /start, /help), do NOT',
        'read `message.text` and check it for a leading slash inside this handler — create a separate trigger-function',
        `document bound to the "${MAX_ON_COMMAND_TRIGGER_NAME}" trigger instead, one per command. A user pressing`,
        '"Start" in a new dialog arrives as the text "/start" (or "/start <payload>" from a deep link).',
        '`message.messageId` is a string; `message.timestamp` is Unix time in milliseconds.',
        '`message.photo`/`.document`/`.audio`/`.video` are `File`s (see the `files` vendor), already resolved —',
        '`null`, not absent, when MAX had media but it could not be fetched; always check for `null` first.',
      ].join(' '),
    },
    {
      name: MAX_ON_COMMAND_TRIGGER_NAME,
      label: 'max:trigger.onCommand',
      scopeType: maxMessageScopeType,
      scopeVariableName: MAX_SCOPE_VARIABLE_NAME,
      signalName: MAX_SIGNAL_NAME,
      webhookPath: MAX_WEBHOOK_PATH,
      contextFields: [{ name: MAX_COMMAND_FIELD_NAME, label: 'max:field.command', kind: 'text' }],
      journalMessage: MAX_JOURNAL_MESSAGE,
      notes: [
        'The correct, ONLY way to handle a MAX bot command (e.g. /start, /help, /cancel) — do not reimplement',
        'command routing by reading `message.text` in the plain onMessage trigger. Create one trigger-function',
        `document per command, bound to this "${MAX_ON_COMMAND_TRIGGER_NAME}" trigger, with`,
        `contextFields.${MAX_COMMAND_FIELD_NAME} set to the command name (the leading slash is optional). The`,
        '"start" command also fires when the user presses "Start" in a new dialog with the bot. A matching command',
        'wins over the onMessage trigger, which is then not signalled for that message. The payload is the same',
        '`message` shape as onMessage.',
      ].join(' '),
    },
  ],
  actions: [
    {
      name: MAX_SEND_MESSAGE_NAME,
      label: 'max:action.sendMessage',
      fields: [
        { name: 'credentialId', label: 'max:field.bot', kind: 'credential-ref', vendor: MAX_VENDOR },
        { name: 'chatId', label: 'max:field.chatId', kind: 'expression', expectedType: anyNumber },
        { name: 'text', label: 'max:field.text', kind: 'template-string' },
      ],
      emit: (fields) => `await maxSendMessage(${fields.credentialId}, ${fields.chatId}, ${fields.text});`,
      activitySignature: 'maxSendMessage(credentialId: string, chatId: number, text: string): Promise<void>',
      journal: { kind: 'message-out', args: ['chatId', 'text'], result: false },
      activityCode: [
        'export const maxSendMessage = async (credentialId: string, chatId: number, text: string): Promise<void> => {',
        '  const botToken = await resolveMaxBotToken(credentialId);',
        '  await maxSendText(botToken, chatId, text);',
        '};',
      ].join('\n'),
    },
    maxSendFileAction,
  ],
  questions: [
    {
      name: MAX_QUESTION_NAME,
      label: 'max:question.askQuestion',
      answerSignalName: MAX_QUESTION_ANSWER_SIGNAL_NAME,
      contextFields: [
        { name: 'credentialId', label: 'max:field.bot', kind: 'credential-ref', vendor: MAX_VENDOR },
        { name: 'chatId', label: 'max:field.chatId', kind: 'expression', expectedType: anyNumber, fieldSize: 'small' },
      ],
      questionFields: [
        { name: 'question', label: 'max:field.question', kind: 'template-string' },
        { name: 'timeout', label: 'max:field.timeout', kind: 'text' },
      ],
      timeoutField: 'timeout',
      journal: { kind: 'message-out', args: ['chatId', 'question', 'options'] },
      askActivitySignature:
        'maxAskQuestion(credentialId: string, chatId: number, question: string, options: readonly string[]): Promise<{ messageId: string }>',
      askActivityCode: [
        'export const maxAskQuestion = async (',
        '  credentialId: string,',
        '  chatId: number,',
        '  question: string,',
        '  options: readonly string[],',
        '): Promise<{ messageId: string }> => {',
        '  const botToken = await resolveMaxBotToken(credentialId);',
        // One callback button per row; the button's payload is its label — the answer signal's `value`.
        "  const buttons = options.map((label) => [{ type: 'callback', text: label, payload: label }]);",
        '  const data = await maxApiRequest(',
        '    botToken,',
        "    'POST',",
        "    'messages',",
        '    { chat_id: chatId },',
        "    { text: question, attachments: [{ type: 'inline_keyboard', payload: { buttons } }] },",
        '  );',
        '  return { messageId: String(data.message.body.mid) };',
        '};',
      ].join('\n'),
      // Same two-step "update message" as Telegram: remove the buttons from the question, then confirm the pick in a
      // separate new message.
      resolveActivitySignature:
        'maxResolveQuestionAnswer(credentialId: string, chatId: number, messageId: string, selectedLabel: string): Promise<void>',
      resolveActivityCode: [
        'export const maxResolveQuestionAnswer = async (',
        '  credentialId: string,',
        '  chatId: number,',
        '  messageId: string,',
        '  selectedLabel: string,',
        '): Promise<void> => {',
        '  const botToken = await resolveMaxBotToken(credentialId);',
        '  await maxStripButtons(botToken, messageId);',
        '  await maxSendText(botToken, chatId, `Выбрано ${selectedLabel}`);',
        '};',
      ].join('\n'),
      // Called instead of the resolve activity when the wait ends without an answer — timeout (`expired`) or a
      // cancelled workflow (`cancelled`).
      closeActivitySignature:
        'maxCloseQuestion(credentialId: string, chatId: number, messageId: string, reason: string): Promise<void>',
      closeActivityCode: [
        'export const maxCloseQuestion = async (',
        '  credentialId: string,',
        '  chatId: number,',
        '  messageId: string,',
        '  reason: string,',
        '): Promise<void> => {',
        '  const botToken = await resolveMaxBotToken(credentialId);',
        '  await maxStripButtons(botToken, messageId);',
        "  await maxSendText(botToken, chatId, reason === 'cancelled' ? 'Отменено' : 'Время истекло');",
        '};',
      ].join('\n'),
    },
  ],
  sharedActivityCode: MAX_SHARED_ACTIVITY_CODE,
  registerBackend: registerMaxBackend,
};

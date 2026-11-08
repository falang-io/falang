import type { TVariableInfo } from '@falang/typescript-dto';
import {
  buildChatTypeContextField,
  buildConversationContextField,
  DURATION_FIELD_AGENT_NOTES,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import {
  MAX_COMMAND_FIELD_NAME,
  MAX_EVENT_SCOPE_VARIABLE_NAME,
  MAX_MEMBER_EVENT_TYPE_ID,
  MAX_MEMBER_JOINED_SIGNAL_NAME,
  MAX_MEMBER_JOINED_TRIGGER_NAME,
  MAX_MEMBER_LEFT_SIGNAL_NAME,
  MAX_MEMBER_LEFT_TRIGGER_NAME,
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
import { maxDeleteMessageAction, maxRemoveMemberAction } from './max-moderation-actions.js';
import { maxSandboxAdapter } from './max-sandbox.js';
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
const maxMemberEventScopeType: TVariableInfo = { type: 'struct', id: MAX_MEMBER_EVENT_TYPE_ID };

/** Routing knobs of the two message triggers (ADR 0076 (private) §2), stored in `triggerConfig`. */
const chatTypeField = buildChatTypeContextField({
  label: 'max:field.chatType',
  any: 'max:chatType.any',
  private: 'max:chatType.private',
  group: 'max:chatType.group',
});
const conversationField = buildConversationContextField({
  label: 'max:field.conversation',
  perChat: 'max:conversation.perChat',
  perUser: 'max:conversation.perUser',
  perEvent: 'max:conversation.perEvent',
});

const ROUTING_NOTES = [
  'Two optional settings route group chats: `chatType` (any | private | group — the trigger only listens to those',
  'chats, so a private-chat document and a group document can coexist) and `conversation` (per-chat = one',
  'long-lived run per chat, the default; per-user = one run per user in a chat, a separate dialog with each member;',
  'per-event = a fresh stateless run for every message). For group moderation (spam filter, deleting messages,',
  'banning) use `chatType: group` with `conversation: per-event`. Buttons of `max-question` pressed in a group are',
  'NOT routed back to the run for per-user/per-event until pending-question routing exists — ask questions only in',
  'private chats or with `conversation: per-chat`.',
].join(' ');

const MEMBER_NOTES = [
  'Use this (instead of the on-message trigger with `chatType: group`) when the bot must react to membership',
  'itself, e.g. greet a newcomer or log a departure — it fires once per event with its own run. MAX delivers',
  'member events only to a bot that is an admin of the chat with the `read_all_messages` right; the platform test bot',
  'of the dev stand never sends them, so the bot needs its own token. `event.byId` is optional.',
].join(' ');

/**
 * The Max messenger (`https://max.ru`, Bot API `https://dev.max.ru/docs-api`) — the same shape as the Telegram
 * integration: on-message and on-command triggers, send message / send file, and a question with inline-keyboard
 * buttons. Bot tokens are resolved in the runner through the backend's internal credential resolver, like Telegram's.
 */
export const maxIntegration: IWorkflowIntegration = {
  vendor: MAX_VENDOR,
  label: 'max:label',
  notes:
    'MAX messenger bots (Russian messenger MAX / Макс, chat bot): receive incoming messages and /commands, send text messages and files, and ask questions with inline-keyboard buttons (yes/no, multiple choice) that pause the workflow until the user taps one. Works like the Telegram integration. Group and community management (moderation): triggers for a member joining or leaving a group chat or channel, and actions to remove or block (kick, ban) a member and to delete a message — the bot must be a chat admin (rights read_all_messages for member events, add_remove_members for removing, delete for deleting messages). Moderation keywords: remove, block, kick, ban, group, chat, community, member. Buttons of max-question pressed in a group chat are not routed back to the run when the trigger uses conversation per-user or per-event — ask in private chats or keep per-chat.',
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
      contextFields: [chatTypeField, conversationField],
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
        ROUTING_NOTES,
      ].join(' '),
    },
    {
      name: MAX_ON_COMMAND_TRIGGER_NAME,
      label: 'max:trigger.onCommand',
      scopeType: maxMessageScopeType,
      scopeVariableName: MAX_SCOPE_VARIABLE_NAME,
      signalName: MAX_SIGNAL_NAME,
      webhookPath: MAX_WEBHOOK_PATH,
      contextFields: [
        { name: MAX_COMMAND_FIELD_NAME, label: 'max:field.command', kind: 'text' },
        chatTypeField,
        conversationField,
      ],
      journalMessage: MAX_JOURNAL_MESSAGE,
      notes: [
        'The correct, ONLY way to handle a MAX bot command (e.g. /start, /help, /cancel) — do not reimplement',
        'command routing by reading `message.text` in the plain onMessage trigger. Create one trigger-function',
        `document per command, bound to this "${MAX_ON_COMMAND_TRIGGER_NAME}" trigger, with`,
        `contextFields.${MAX_COMMAND_FIELD_NAME} set to the command name (the leading slash is optional). The`,
        '"start" command also fires when the user presses "Start" in a new dialog with the bot. A matching command',
        'wins over the onMessage trigger, which is then not signalled for that message. The payload is the same',
        '`message` shape as onMessage.',
        ROUTING_NOTES,
      ].join(' '),
    },
    {
      name: MAX_MEMBER_JOINED_TRIGGER_NAME,
      label: 'max:trigger.memberJoined',
      scopeType: maxMemberEventScopeType,
      scopeVariableName: MAX_EVENT_SCOPE_VARIABLE_NAME,
      signalName: MAX_MEMBER_JOINED_SIGNAL_NAME,
      webhookPath: MAX_WEBHOOK_PATH,
      journalMessage: '${event.user.firstName} joined',
      notes: `A user joined a MAX group chat or channel the bot administers (update user_added). ${MEMBER_NOTES} \`event.byId\` is the inviter and is absent when the user joined by an invite link.`,
    },
    {
      name: MAX_MEMBER_LEFT_TRIGGER_NAME,
      label: 'max:trigger.memberLeft',
      scopeType: maxMemberEventScopeType,
      scopeVariableName: MAX_EVENT_SCOPE_VARIABLE_NAME,
      signalName: MAX_MEMBER_LEFT_SIGNAL_NAME,
      webhookPath: MAX_WEBHOOK_PATH,
      journalMessage: '${event.user.firstName} left',
      notes: `A user left, or was removed from, a MAX group chat or channel the bot administers (update user_removed). ${MEMBER_NOTES} \`event.byId\` is the admin who removed the user and is absent when the user left on their own.`,
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
        '  const bot = await resolveMaxBotToken(credentialId);',
        '  await maxSendText(bot, chatId, text);',
        '};',
      ].join('\n'),
    },
    maxSendFileAction,
    maxRemoveMemberAction,
    maxDeleteMessageAction,
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
        {
          name: 'timeout',
          label: 'max:field.timeout',
          help: 'max:help.timeout',
          agentNotes: DURATION_FIELD_AGENT_NOTES,
          kind: 'text',
        },
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
        '  const bot = await resolveMaxBotToken(credentialId);',
        // One callback button per row; the button's payload is its label — the answer signal's `value`.
        "  const buttons = options.map((label) => [{ type: 'callback', text: label, payload: label }]);",
        '  const data = await maxApiRequest(',
        '    bot,',
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
        '  const bot = await resolveMaxBotToken(credentialId);',
        '  await maxStripButtons(bot, messageId);',
        '  await maxSendText(bot, chatId, `Выбрано ${selectedLabel}`);',
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
        '  const bot = await resolveMaxBotToken(credentialId);',
        '  await maxStripButtons(bot, messageId);',
        "  await maxSendText(bot, chatId, reason === 'cancelled' ? 'Отменено' : 'Время истекло');",
        '};',
      ].join('\n'),
    },
  ],
  sharedActivityCode: MAX_SHARED_ACTIVITY_CODE,
  registerBackend: registerMaxBackend,
  sandbox: maxSandboxAdapter,
};

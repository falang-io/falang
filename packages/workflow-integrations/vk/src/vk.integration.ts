import type { TVariableInfo } from '@falang/typescript-dto';
import {
  buildChatTypeContextField,
  buildConversationContextField,
  DURATION_FIELD_AGENT_NOTES,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import {
  VK_COMMAND_FIELD_NAME,
  VK_MESSAGE_TYPE_ID,
  VK_ON_COMMAND_TRIGGER_NAME,
  VK_QUESTION_ANSWER_SIGNAL_NAME,
  VK_QUESTION_NAME,
  VK_SCOPE_VARIABLE_NAME,
  VK_SEND_MESSAGE_NAME,
  VK_SIGNAL_NAME,
  VK_TRIGGER_NAME,
  VK_VENDOR,
} from './constants.js';
import { registerVkBackend } from './vk-backend.js';
import { vkMemberTriggers } from './vk-member-triggers.js';
import { vkDeleteMessageAction, vkKickFromChatAction } from './vk-moderation-actions.js';
import { vkSandboxAdapter } from './vk-sandbox.js';
import { vkSendButtonsAction } from './vk-send-buttons-action.js';
import { vkSendFileAction } from './vk-send-file-action.js';
import { VK_SHARED_ACTIVITY_CODE } from './vk-shared-activity-code.js';
import { vkStructTypes } from './vk-struct-types.js';

export * from './constants.js';
export { vkStructTypes } from './vk-struct-types.js';

/** Run-journal line for both triggers (ADR 0059 (private)): the message text, or a marker for media-only messages. */
const VK_JOURNAL_MESSAGE = "${message.text || '[no text]'}";

const VK_WEBHOOK_PATH = '/webhooks/vk/:projectId/:credentialId/:env';

/** The two routing knobs of the on-message triggers (ADR 0076 (private) §2); labels are i18n keys in `locales/`. */
const vkChatTypeField = buildChatTypeContextField({
  label: 'vk:field.chatType',
  any: 'vk:chatType.any',
  private: 'vk:chatType.private',
  group: 'vk:chatType.group',
});
const vkConversationField = buildConversationContextField({
  label: 'vk:field.conversation',
  perChat: 'vk:conversation.perChat',
  perUser: 'vk:conversation.perUser',
  perEvent: 'vk:conversation.perEvent',
});

const VK_ROUTING_NOTES = [
  'Two optional settings route the messages: contextFields.chatType ("any" default, "private" = one-to-one dialogs,',
  '"group" = conversations, peer_id above 2000000000) picks which chats the trigger listens to, so a private-chat',
  'handler and a conversation handler can be separate documents; contextFields.conversation says which execution a',
  'message belongs to: "per-chat" (default, one dialog per chat — the bot as a conversation partner), "per-user" (a',
  'separate dialog with every member of a conversation) or "per-event" (a fresh stateless execution for every single',
  'message — community moderation: chatType "group" + conversation "per-event", then vk-delete-message /',
  'vk-kick-from-chat). In a conversation with "per-user" or "per-event" a vk-question button is NOT routed back to',
  'the run that asked (not yet supported) — ask questions in private chats or with "per-chat".',
].join(' ');

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

const vkMessageScopeType: TVariableInfo = { type: 'struct', id: VK_MESSAGE_TYPE_ID };

/** VK limits: a label is at most 40 characters, a payload 255 characters of JSON, an inline keyboard 10 buttons. */
const VK_BUTTON_LABEL_LIMIT = 40;
const VK_BUTTON_ANSWER_LIMIT = 200;
const VK_MAX_QUESTION_OPTIONS = 10;

/**
 * VKontakte community bots (`https://vk.com`, API `https://dev.vk.com`) — the same shape as the Telegram and MAX
 * integrations: on-message and on-command triggers, send message / send file, and a question with inline callback
 * buttons. The community access key is resolved in the runner through the backend's internal credential resolver.
 */
export const vkIntegration: IWorkflowIntegration = {
  vendor: VK_VENDOR,
  label: 'vk:label',
  notes:
    'VKontakte (VK / ВКонтакте) community bots: receive incoming messages and /commands sent to a community, send text messages and files (optionally with link or command buttons that do not wait for a press), and ask questions with inline callback buttons (yes/no, multiple choice) that pause the workflow until the user taps one. Works like the Telegram integration; reply to `message.chat.id` (VK peer_id). Pressing "Начать" arrives as the text "/start". Community moderation, group and conversation management: member triggers (a subscriber joined or left the community, a join request, a member joined or left a conversation/chat) and the actions vk-kick-from-chat (remove a member from a conversation) and vk-delete-message; the community must be an administrator of the conversation (right to delete messages and remove members). There is no community-level ban and no approving of join requests with a community key. vk-question buttons pressed in a conversation are not routed to the run that asked when the trigger uses conversation "per-user" or "per-event".',
  locales: {
    en: () => import('./locales/en.json'),
    ru: () => import('./locales/ru.json'),
  },
  credentialFields: [{ name: 'accessToken', label: 'vk:credentialField.accessToken', kind: 'secret' }],
  types: vkStructTypes,
  triggers: [
    {
      name: VK_TRIGGER_NAME,
      label: 'vk:trigger.onMessage',
      scopeType: vkMessageScopeType,
      scopeVariableName: VK_SCOPE_VARIABLE_NAME,
      signalName: VK_SIGNAL_NAME,
      webhookPath: VK_WEBHOOK_PATH,
      contextFields: [vkChatTypeField, vkConversationField],
      journalMessage: VK_JOURNAL_MESSAGE,
      notes: [
        'Fires for every incoming message to this VK community, commands included — there is no way to filter which',
        'messages reach this trigger from here. To react to a specific slash command (e.g. /start, /help), do NOT',
        'read `message.text` and check it for a leading slash inside this handler — create a separate trigger-function',
        `document bound to the "${VK_ON_COMMAND_TRIGGER_NAME}" trigger instead, one per command. A user pressing`,
        '"Начать" (Start) in a new dialog arrives as the text "/start" (or "/start <ref>" from a vk.me deep link).',
        'Reply to `message.chat.id` (VK peer_id: a user id for a private dialog, 2000000000+ for a conversation).',
        '`message.date` is Unix time in seconds; `message.from` may be absent.',
        '`message.photo`/`.document`/`.voice` are `File`s (see the `files` vendor), already resolved —',
        '`null`, not absent, when VK had media but it could not be fetched; always check for `null` first.',
        `Several on-message documents may coexist when their chatType filters differ. ${VK_ROUTING_NOTES}`,
      ].join(' '),
    },
    {
      name: VK_ON_COMMAND_TRIGGER_NAME,
      label: 'vk:trigger.onCommand',
      scopeType: vkMessageScopeType,
      scopeVariableName: VK_SCOPE_VARIABLE_NAME,
      signalName: VK_SIGNAL_NAME,
      webhookPath: VK_WEBHOOK_PATH,
      contextFields: [
        { name: VK_COMMAND_FIELD_NAME, label: 'vk:field.command', kind: 'text' },
        vkChatTypeField,
        vkConversationField,
      ],
      journalMessage: VK_JOURNAL_MESSAGE,
      notes: [
        'The correct, ONLY way to handle a VK bot command (e.g. /start, /help, /cancel) — do not reimplement',
        'command routing by reading `message.text` in the plain onMessage trigger. Create one trigger-function',
        `document per command, bound to this "${VK_ON_COMMAND_TRIGGER_NAME}" trigger, with`,
        `contextFields.${VK_COMMAND_FIELD_NAME} set to the command name (the leading slash is optional). The`,
        '"start" command also fires when the user presses "Начать" in a new dialog with the community. A matching',
        'command wins over the onMessage trigger, which is then not signalled for that message. The payload is the same',
        '`message` shape as onMessage.',
        VK_ROUTING_NOTES,
      ].join(' '),
    },
    ...vkMemberTriggers,
  ],
  actions: [
    {
      name: VK_SEND_MESSAGE_NAME,
      label: 'vk:action.sendMessage',
      fields: [
        { name: 'credentialId', label: 'vk:field.bot', kind: 'credential-ref', vendor: VK_VENDOR },
        {
          name: 'chatId',
          label: 'vk:field.chatId',
          help: 'vk:help.chatId',
          kind: 'expression',
          expectedType: anyNumber,
        },
        { name: 'text', label: 'vk:field.text', kind: 'template-string' },
      ],
      emit: (fields) => `await vkSendMessage(${fields.credentialId}, ${fields.chatId}, ${fields.text});`,
      activitySignature: 'vkSendMessage(credentialId: string, chatId: number, text: string): Promise<void>',
      journal: { kind: 'message-out', args: ['chatId', 'text'], result: false },
      activityCode: [
        'export const vkSendMessage = async (credentialId: string, chatId: number, text: string): Promise<void> => {',
        '  const bot = await resolveVkAccessToken(credentialId);',
        '  await vkSendText(bot, chatId, text);',
        '};',
      ].join('\n'),
    },
    vkSendFileAction,
    vkSendButtonsAction,
    vkKickFromChatAction,
    vkDeleteMessageAction,
  ],
  questions: [
    {
      name: VK_QUESTION_NAME,
      label: 'vk:question.askQuestion',
      answerSignalName: VK_QUESTION_ANSWER_SIGNAL_NAME,
      contextFields: [
        { name: 'credentialId', label: 'vk:field.bot', kind: 'credential-ref', vendor: VK_VENDOR },
        {
          name: 'chatId',
          label: 'vk:field.chatId',
          help: 'vk:help.chatId',
          kind: 'expression',
          expectedType: anyNumber,
          fieldSize: 'small',
        },
      ],
      questionFields: [
        { name: 'question', label: 'vk:field.question', kind: 'template-string' },
        {
          name: 'timeout',
          label: 'vk:field.timeout',
          help: 'vk:help.timeout',
          agentNotes: DURATION_FIELD_AGENT_NOTES,
          kind: 'text',
        },
      ],
      timeoutField: 'timeout',
      journal: { kind: 'message-out', args: ['chatId', 'question', 'options'] },
      askActivitySignature:
        'vkAskQuestion(credentialId: string, chatId: number, question: string, options: readonly string[]): Promise<{ messageId: string }>',
      askActivityCode: [
        'export const vkAskQuestion = async (',
        '  credentialId: string,',
        '  chatId: number,',
        '  question: string,',
        '  options: readonly string[],',
        '): Promise<{ messageId: string }> => {',
        '  const bot = await resolveVkAccessToken(credentialId);',
        `  if (options.length > ${VK_MAX_QUESTION_OPTIONS}) throw new Error('VK allows at most ${VK_MAX_QUESTION_OPTIONS} buttons in a question');`,
        // A keyboard holds at most 6 inline rows: one button per row up to 6 options, two per row beyond that.
        '  const perRow = options.length <= 6 ? 1 : 2;',
        '  const rows: unknown[][] = [];',
        '  options.forEach((label, index) => {',
        '    // The answer value (the full label) travels in the payload; the visible label is cut to what VK accepts.',
        `    const answer = label.slice(0, ${VK_BUTTON_ANSWER_LIMIT});`,
        `    const button = { action: { type: 'callback', label: label.slice(0, ${VK_BUTTON_LABEL_LIMIT}), payload: JSON.stringify({ falang: answer }) } };`,
        '    if (index % perRow === 0) rows.push([button]);',
        '    else rows[rows.length - 1].push(button);',
        '  });',
        // One `peer_ids` value makes VK answer with the conversation_message_id, which a `message_event` carries (the
        // plain `peer_id` answer is only the global message id).
        "  const sent = await vkApiCall(bot, 'messages.send', {",
        '    peer_ids: String(chatId),',
        '    random_id: vkRandomId(),',
        '    message: question,',
        '    keyboard: { inline: true, buttons: rows },',
        '  });',
        '  const item = sent[0];',
        '  if (item?.error) throw new Error(`VK messages.send failed: ${JSON.stringify(item.error)}`);',
        '  return { messageId: String(item.conversation_message_id) };',
        '};',
      ].join('\n'),
      // Same two-step "update message" as Telegram: remove the buttons from the question, then confirm the pick in a
      // separate new message.
      resolveActivitySignature:
        'vkResolveQuestionAnswer(credentialId: string, chatId: number, messageId: string, selectedLabel: string): Promise<void>',
      resolveActivityCode: [
        'export const vkResolveQuestionAnswer = async (',
        '  credentialId: string,',
        '  chatId: number,',
        '  messageId: string,',
        '  selectedLabel: string,',
        '): Promise<void> => {',
        '  const bot = await resolveVkAccessToken(credentialId);',
        '  await vkStripButtons(bot, chatId, messageId);',
        '  await vkSendText(bot, chatId, `Выбрано ${selectedLabel}`);',
        '};',
      ].join('\n'),
      // Called instead of the resolve activity when the wait ends without an answer — timeout (`expired`) or a
      // cancelled workflow (`cancelled`).
      closeActivitySignature:
        'vkCloseQuestion(credentialId: string, chatId: number, messageId: string, reason: string): Promise<void>',
      closeActivityCode: [
        'export const vkCloseQuestion = async (',
        '  credentialId: string,',
        '  chatId: number,',
        '  messageId: string,',
        '  reason: string,',
        '): Promise<void> => {',
        '  const bot = await resolveVkAccessToken(credentialId);',
        '  await vkStripButtons(bot, chatId, messageId);',
        "  await vkSendText(bot, chatId, reason === 'cancelled' ? 'Отменено' : 'Время истекло');",
        '};',
      ].join('\n'),
    },
  ],
  sharedActivityCode: VK_SHARED_ACTIVITY_CODE,
  registerBackend: registerVkBackend,
  sandbox: vkSandboxAdapter,
};

import type { TVariableInfo } from '@falang/typescript-dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import {
  TELEGRAM_COMMAND_FIELD_NAME,
  TELEGRAM_MESSAGE_TYPE_ID,
  TELEGRAM_ON_COMMAND_TRIGGER_NAME,
  TELEGRAM_QUESTION_ANSWER_SIGNAL_NAME,
  TELEGRAM_QUESTION_NAME,
  TELEGRAM_SCOPE_VARIABLE_NAME,
  TELEGRAM_SEND_MESSAGE_NAME,
  TELEGRAM_SIGNAL_NAME,
  TELEGRAM_TRIGGER_NAME,
  TELEGRAM_VENDOR,
} from './constants.js';
import { registerTelegramBackend } from './telegram-backend.js';
import { telegramSendFileAction } from './telegram-send-file-action.js';
import { telegramStructTypes } from './telegram-struct-types.js';

export * from './constants.js';
export { telegramStructTypes } from './telegram-struct-types.js';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

const telegramMessageScopeType: TVariableInfo = { type: 'struct', id: TELEGRAM_MESSAGE_TYPE_ID };

/**
 * `emit`'s `fields.credentialId` is expected to already be the fully-resolved argument expression by
 * the time the compiler calls this. `activityCode`'s `resolveTelegramBotToken` calls
 * `@falang/workflow-backend`'s internal credential resolver (`POST /internal/credentials/resolve`,
 * guarded by a per-project scoped token, see ADR 0006 and ADR 0016 (private)'s "Namespace/RBAC
 * model and inter-pod auth") — `BACKEND_INTERNAL_URL`/`INTERNAL_PROJECT_TOKEN`/`PROJECT_ID`/
 * `WORKFLOW_ENV` are env vars `RunnerProcessManager` sets on every runner pod it creates.
 */
export const telegramIntegration: IWorkflowIntegration = {
  vendor: TELEGRAM_VENDOR,
  label: 'telegram:label',
  notes:
    'Telegram messenger bots (chat bot): receive incoming messages and /commands, send text messages, and ask questions with inline-keyboard buttons (yes/no, multiple choice) that pause the workflow until the user taps one.',
  locales: {
    en: () => import('./locales/en.json'),
    ru: () => import('./locales/ru.json'),
  },
  credentialFields: [{ name: 'botToken', label: 'telegram:credentialField.botToken', kind: 'secret' }],
  types: telegramStructTypes,
  triggers: [
    {
      name: TELEGRAM_TRIGGER_NAME,
      label: 'telegram:trigger.onMessage',
      scopeType: telegramMessageScopeType,
      scopeVariableName: TELEGRAM_SCOPE_VARIABLE_NAME,
      signalName: TELEGRAM_SIGNAL_NAME,
      webhookPath: '/webhooks/telegram/:projectId/:credentialId/:env',
      // Found worth adding after a real user chat where the agent built a bot's whole "handle /start"
      // flow as free-text `if message.text.trim().toLowerCase().startsWith('/start')` logic inside this
      // trigger's own body, instead of ever calling create_trigger_document with the on-command trigger
      // below — see that trigger's own `notes` for why, and ADR 0034 (private)'s matching
      // "Found and fixed" section.
      notes: [
        'Fires for every incoming message to this bot, commands included — there is no way to filter',
        'which messages reach this trigger from here. If the bot needs to react to a specific slash',
        'command (e.g. /start, /help), do NOT read `message.text` and check it for a leading slash',
        'inside this handler — create a separate trigger-function document bound to the',
        `"${TELEGRAM_ON_COMMAND_TRIGGER_NAME}" trigger instead, one such document per command, and let`,
        'this onMessage trigger handle only genuinely free-text input (e.g. an answer to a question this',
        'bot itself asked). `message.photo`/`.document`/`.voice`/`.audio`/`.video` are `File`s (see the',
        '`files` vendor), already resolved — `null`, not absent, when Telegram had media but it could not',
        'be fetched (over 20 MB, or a download error); always check for `null` before using one.',
      ].join(' '),
    },
    /**
     * Fires only for messages whose text is the configured `/command` (leading slash optional when
     * typed, and a trailing `@botUsername` — Telegram appends this in group chats — is stripped before
     * comparing, see `telegram-backend.ts`'s `extractCommand`/`normalizeCommandName`). Same payload
     * shape/signal/webhook path as `onMessage` — it's a routing distinction made by
     * `registerTelegramBackend` (which of several bound `trigger-function`s to signal for a given
     * update), not a different wire format, so there's nothing vendor-specific to add on the compiler
     * side beyond what `onMessage` already has.
     */
    {
      name: TELEGRAM_ON_COMMAND_TRIGGER_NAME,
      label: 'telegram:trigger.onCommand',
      scopeType: telegramMessageScopeType,
      scopeVariableName: TELEGRAM_SCOPE_VARIABLE_NAME,
      signalName: TELEGRAM_SIGNAL_NAME,
      webhookPath: '/webhooks/telegram/:projectId/:credentialId/:env',
      contextFields: [{ name: TELEGRAM_COMMAND_FIELD_NAME, label: 'telegram:field.command', kind: 'text' }],
      notes: [
        'The correct, ONLY way to handle a Telegram bot command (e.g. /start, /help, /cancel) — do not',
        'reimplement command routing yourself by reading `message.text` in the plain onMessage trigger',
        'and checking it for a leading slash. Create one trigger-function document per command, bound to',
        `this "${TELEGRAM_ON_COMMAND_TRIGGER_NAME}" trigger, with`,
        `contextFields.${TELEGRAM_COMMAND_FIELD_NAME} set to the command name (the leading slash is`,
        'optional — "start" and "/start" both match). This trigger fires ONLY when an incoming message',
        'is exactly that command (an optional trailing "@botUsername" Telegram appends in group chats is',
        'stripped before comparing); if a command-function and the plain onMessage trigger are both bound',
        'for the same bot, a matching command always wins and the onMessage trigger is not signalled for',
        'that message. The compiled function body receives the same `message` payload shape as onMessage',
        '(chat/from/text/…) — this is only a routing distinction, not a different payload.',
      ].join(' '),
    },
  ],
  actions: [
    {
      name: TELEGRAM_SEND_MESSAGE_NAME,
      label: 'telegram:action.sendMessage',
      fields: [
        { name: 'credentialId', label: 'telegram:field.bot', kind: 'credential-ref', vendor: TELEGRAM_VENDOR },
        { name: 'chatId', label: 'telegram:field.chatId', kind: 'expression', expectedType: anyNumber },
        { name: 'text', label: 'telegram:field.text', kind: 'template-string' },
      ],
      emit: (fields) => `await telegramSendMessage(${fields.credentialId}, ${fields.chatId}, ${fields.text});`,
      activitySignature: 'telegramSendMessage(credentialId: string, chatId: number, text: string): Promise<void>',
      // These strings are TypeScript source emitted verbatim into activities.ts, not code executed
      // here — the `${...}` template placeholders below are meant to survive as literal text and
      // interpolate when that emitted file runs, not now.
      activityCode: [
        'export const telegramSendMessage = async (credentialId: string, chatId: number, text: string): Promise<void> => {',
        '  const botToken = await resolveTelegramBotToken(credentialId);',
        '  const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${botToken}/sendMessage`, {',
        "    method: 'POST',",
        "    headers: { 'Content-Type': 'application/json' },",
        '    body: JSON.stringify({ chat_id: chatId, text }),',
        '  });',
        '  if (!response.ok) {',
        '    throw new Error(`Telegram sendMessage failed: ${response.status} ${await response.text()}`);',
        '  }',
        '};',
      ].join('\n'),
    },
    telegramSendFileAction,
  ],
  questions: [
    {
      name: TELEGRAM_QUESTION_NAME,
      label: 'telegram:question.askQuestion',
      answerSignalName: TELEGRAM_QUESTION_ANSWER_SIGNAL_NAME,
      contextFields: [
        { name: 'credentialId', label: 'telegram:field.bot', kind: 'credential-ref', vendor: TELEGRAM_VENDOR },
        {
          name: 'chatId',
          label: 'telegram:field.chatId',
          kind: 'expression',
          expectedType: anyNumber,
          fieldSize: 'small',
        },
      ],
      questionFields: [
        { name: 'question', label: 'telegram:field.question', kind: 'template-string' },
        { name: 'timeout', label: 'telegram:field.timeout', kind: 'text' },
      ],
      // Empty (the default) means "wait forever", today's original behavior — see
      // `IQuestionDescriptorExtensions.timeoutField`'s doc. Added 2026-09-28 alongside `human-task`
      // (ADR 0040 (private) §4, "Decisions" item 4).
      timeoutField: 'timeout',
      askActivitySignature:
        'telegramAskQuestion(credentialId: string, chatId: number, question: string, options: readonly string[]): Promise<{ messageId: string }>',
      askActivityCode: [
        'export const telegramAskQuestion = async (',
        '  credentialId: string,',
        '  chatId: number,',
        '  question: string,',
        '  options: readonly string[],',
        '): Promise<{ messageId: string }> => {',
        '  const botToken = await resolveTelegramBotToken(credentialId);',
        '  const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${botToken}/sendMessage`, {',
        "    method: 'POST',",
        "    headers: { 'Content-Type': 'application/json' },",
        '    body: JSON.stringify({',
        '      chat_id: chatId,',
        '      text: question,',
        '      reply_markup: { inline_keyboard: options.map((label) => [{ text: label, callback_data: label }]) },',
        '    }),',
        '  });',
        '  if (!response.ok) {',
        '    throw new Error(`Telegram sendMessage (question) failed: ${response.status} ${await response.text()}`);',
        '  }',
        '  const data = (await response.json()) as { result: { message_id: number } };',
        '  return { messageId: String(data.result.message_id) };',
        '};',
      ].join('\n'),
      // `resolveActivityCode` does the two-step "update message" the user asked for: strip the
      // buttons from the original question message (an edit, text unchanged), then send a *separate*
      // new message confirming the pick — not an edit of the question's own text.
      resolveActivitySignature:
        'telegramResolveQuestionAnswer(credentialId: string, chatId: number, messageId: string, selectedLabel: string): Promise<void>',
      resolveActivityCode: [
        'export const telegramResolveQuestionAnswer = async (',
        '  credentialId: string,',
        '  chatId: number,',
        '  messageId: string,',
        '  selectedLabel: string,',
        '): Promise<void> => {',
        '  const botToken = await resolveTelegramBotToken(credentialId);',
        '  const stripButtonsResponse = await fetch(`${TELEGRAM_API_BASE_URL}/bot${botToken}/editMessageReplyMarkup`, {',
        "    method: 'POST',",
        "    headers: { 'Content-Type': 'application/json' },",
        '    body: JSON.stringify({ chat_id: chatId, message_id: Number(messageId), reply_markup: { inline_keyboard: [] } }),',
        '  });',
        '  if (!stripButtonsResponse.ok) {',
        '    throw new Error(',
        '      `Telegram editMessageReplyMarkup failed: ${stripButtonsResponse.status} ${await stripButtonsResponse.text()}`,',
        '    );',
        '  }',
        '  const confirmResponse = await fetch(`${TELEGRAM_API_BASE_URL}/bot${botToken}/sendMessage`, {',
        "    method: 'POST',",
        "    headers: { 'Content-Type': 'application/json' },",
        '    body: JSON.stringify({ chat_id: chatId, text: `Выбрано ${selectedLabel}` }),',
        '  });',
        '  if (!confirmResponse.ok) {',
        '    throw new Error(`Telegram sendMessage (confirmation) failed: ${confirmResponse.status} ${await confirmResponse.text()}`);',
        '  }',
        '};',
      ].join('\n'),
      // Called instead of `resolveActivityCode` when the wait ends without a real answer — on
      // timeout (`reason: 'expired'`) or when the enclosing workflow is cancelled
      // (`reason: 'cancelled'`, see `question-emitters.ts`'s `CancellationScope.nonCancellable`
      // wrapper) — same two-step "strip buttons, then confirm" shape as `resolveActivityCode`, just
      // with a fixed message per `reason` instead of "you picked X".
      closeActivitySignature:
        'telegramCloseQuestion(credentialId: string, chatId: number, messageId: string, reason: string): Promise<void>',
      closeActivityCode: [
        'export const telegramCloseQuestion = async (',
        '  credentialId: string,',
        '  chatId: number,',
        '  messageId: string,',
        '  reason: string,',
        '): Promise<void> => {',
        '  const botToken = await resolveTelegramBotToken(credentialId);',
        '  const stripButtonsResponse = await fetch(`${TELEGRAM_API_BASE_URL}/bot${botToken}/editMessageReplyMarkup`, {',
        "    method: 'POST',",
        "    headers: { 'Content-Type': 'application/json' },",
        '    body: JSON.stringify({ chat_id: chatId, message_id: Number(messageId), reply_markup: { inline_keyboard: [] } }),',
        '  });',
        '  if (!stripButtonsResponse.ok) {',
        '    throw new Error(',
        '      `Telegram editMessageReplyMarkup failed: ${stripButtonsResponse.status} ${await stripButtonsResponse.text()}`,',
        '    );',
        '  }',
        "  const text = reason === 'cancelled' ? 'Отменено' : 'Время истекло';",
        '  const confirmResponse = await fetch(`${TELEGRAM_API_BASE_URL}/bot${botToken}/sendMessage`, {',
        "    method: 'POST',",
        "    headers: { 'Content-Type': 'application/json' },",
        '    body: JSON.stringify({ chat_id: chatId, text }),',
        '  });',
        '  if (!confirmResponse.ok) {',
        '    throw new Error(`Telegram sendMessage (close) failed: ${confirmResponse.status} ${await confirmResponse.text()}`);',
        '  }',
        '};',
      ].join('\n'),
    },
  ],
  // Shared by `telegramSendMessage`/`telegramAskQuestion`/`telegramResolveQuestionAnswer` — emitted
  // once by `compileActivities` (see `IWorkflowIntegration.sharedActivityCode`) so this isn't
  // redeclared per activity, which would collide once concatenated into one activities.ts module.
  sharedActivityCode: [
    // Aliased so this never collides with `@falang/workflow-integrations-files`'s own
    // `import { ..., readFileBytes, ... } from '@falang/workflow-integrations-files';` in its own
    // `sharedActivityCode` — both vendors are always registered together (see
    // `packages/workflow/backend/src/domains/integrations/registered-integrations.ts`), and
    // `compileActivities` only dedups whole import *statements* that are string-identical, not
    // individual imported bindings, so two differently-shaped imports of the same name would
    // otherwise redeclare it twice in the same generated module. The `IFileRef` type import below is
    // deliberately the exact same line files' own `sharedActivityCode` uses, so it dedups instead.
    "import { readFileBytes as telegramReadFileBytes } from '@falang/workflow-integrations-files';",
    "import type { IFileRef } from '@falang/workflow-integrations-files';",
    '',
    "// Overridable so e2e tests can point this at @falang/workflow-mocks's Telegram mock instead of",
    '// the real Bot API — same env var telegram-backend.ts reads in-process.',
    "const TELEGRAM_API_BASE_URL = process.env.TELEGRAM_API_BASE_URL ?? 'https://api.telegram.org';",
    '',
    "// Resolves credentialId -> real bot token via @falang/workflow-backend's internal endpoint —",
    '// see ADR 0006 and ADR 0016 (private) (per-project scoped token, not a shared secret). Never',
    '// caches: these activities run at most once per outbound call, and the resolver call itself is',
    '// cheap relative to the Telegram API call right after it.',
    'const resolveTelegramBotToken = async (credentialId: string): Promise<string> => {',
    '  const backendUrl = process.env.BACKEND_INTERNAL_URL;',
    '  const internalProjectToken = process.env.INTERNAL_PROJECT_TOKEN;',
    '  const projectId = process.env.PROJECT_ID;',
    '  if (!backendUrl || !internalProjectToken || !projectId) {',
    "    throw new Error('BACKEND_INTERNAL_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID are not configured for this runner process');",
    '  }',
    "  const env = process.env.WORKFLOW_ENV === 'prod' ? 'prod' : 'dev';",
    '  const response = await fetch(`${backendUrl}/internal/credentials/resolve`, {',
    "    method: 'POST',",
    "    headers: { 'Content-Type': 'application/json', 'x-internal-project-token': internalProjectToken },",
    "    body: JSON.stringify({ credentialId, vendor: 'telegram', field: 'botToken', projectId, env }),",
    '  });',
    '  if (!response.ok) {',
    '    throw new Error(`Failed to resolve Telegram credential ${credentialId}: ${response.status} ${await response.text()}`);',
    '  }',
    '  const data = (await response.json()) as { value: string };',
    '  return data.value;',
    '};',
  ].join('\n'),
  registerBackend: registerTelegramBackend,
};

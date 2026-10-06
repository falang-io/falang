// oxlint-disable max-lines -- over the default cap by the run-journal reports for unroutable input (ADR 0059 (private) §2c).
import { TRIGGER_FUNCTION_BODY_NAME, TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type {
  IIntegrationBackendContext,
  IIntegrationDocumentRecord,
  TRegisterIntegrationBackend,
} from '@falang/workflow-integrations-common';
import {
  TELEGRAM_COMMAND_FIELD_NAME,
  TELEGRAM_ON_COMMAND_TRIGGER_NAME,
  TELEGRAM_QUESTION_ANSWER_SIGNAL_NAME,
  TELEGRAM_SIGNAL_NAME,
  TELEGRAM_TRIGGER_NAME,
} from './constants.js';
import { resolveIncomingMedia } from './telegram-media.js';
import { toTelegramMessage, type ITelegramRawMessage } from './telegram-message-mapper.js';

/** Telegram's own long-poll timeout (seconds) — `getUpdates` blocks server-side for roughly this long when idle. */
const TELEGRAM_POLL_TIMEOUT_SECONDS = 30;
/** Gap between successive polls — negligible on top of `getUpdates`' own server-side blocking wait above. */
const POLL_INTERVAL_MS = 1000;

interface ITriggerFunctionBodyData {
  readonly vendor: string;
  readonly triggerName: string;
  readonly credentialId: string;
  readonly triggerConfig?: Readonly<Record<string, string>>;
}

interface ITelegramCallbackQuery {
  readonly id: string;
  readonly data?: string;
  /** Deliberately left as the raw Bot API shape (not mapped through `toTelegramMessage`) — only
   *  `chat.id`/`message_id` are ever read off it (see `handleCallbackQuery`/`selectTriggerFunctionForCallback`
   *  below), a plain correlation lookup rather than a payload delivered into a compiled workflow. */
  readonly message?: ITelegramRawMessage;
  readonly from?: ITelegramRawMessage['from'];
}

interface ITelegramUpdate {
  readonly update_id: number;
  readonly message?: ITelegramRawMessage;
  readonly callback_query?: ITelegramCallbackQuery;
}

/**
 * Overridable so e2e tests can point this at `@falang/workflow-mocks`'s Telegram mock instead of the
 * real Bot API. Guarded by `typeof process` because this module is also reached from the browser
 * bundle (`@falang/workflow-client` imports `registerTelegramBackend` via this package's barrel
 * export), where the Node `process` global doesn't exist.
 */
const TELEGRAM_API_BASE_URL =
  typeof process === 'undefined'
    ? 'https://api.telegram.org'
    : (process.env.TELEGRAM_API_BASE_URL ?? 'https://api.telegram.org');

const telegramApiUrl = (token: string, method: string): string => `${TELEGRAM_API_BASE_URL}/bot${token}/${method}`;

// oxlint-disable-next-line no-empty-function -- shared no-op dispose for targets with nothing to tear down remotely (missing bot token, poll mode — see call sites below).
const noopDispose = async (): Promise<void> => {};

/** `trigger-function`'s childTuple is `[function-header, trigger-function-body, function-footer]` — see `@falang/workflow-dto`. */
const getTriggerFunctionBodyData = (doc: IIntegrationDocumentRecord): ITriggerFunctionBodyData | undefined => {
  const body = doc.root?.children?.[1];
  if (body?.name !== TRIGGER_FUNCTION_BODY_NAME) return;
  return body.data as ITriggerFunctionBodyData;
};

const findBoundTriggerFunctions = async (
  ctx: IIntegrationBackendContext,
): Promise<readonly IIntegrationDocumentRecord[]> => {
  const triggerFunctionDocuments = await ctx.getDocumentsByType(TRIGGER_FUNCTION_NAME);
  return triggerFunctionDocuments.filter((doc) => {
    const body = getTriggerFunctionBodyData(doc);
    return body?.vendor === ctx.vendor && body.credentialId === ctx.credentialId;
  });
};

/** A leading `/command`, with an optional Telegram-appended `@botUsername` suffix (present in group chats) stripped. */
const COMMAND_PATTERN = /^\/([a-zA-Z0-9_]+)(?:@\S+)?(?:\s|$)/;

const extractCommand = (text: string): string | undefined => COMMAND_PATTERN.exec(text)?.[1];

/** Tolerates the command being configured with or without its leading slash. */
const normalizeCommandName = (value: string): string => value.trim().replace(/^\//, '');

/**
 * At most one `trigger-function` is signalled per incoming message: a bound on-command trigger whose
 * configured command matches the message's leading `/command` wins over the catch-all on-message
 * trigger (if both are bound to the same credential) — mirrors the common bot-framework convention
 * that a specific command handler takes priority over a generic message handler.
 */
const selectTriggerFunctionForMessage = (
  documents: readonly IIntegrationDocumentRecord[],
  message: ITelegramRawMessage,
): IIntegrationDocumentRecord | undefined => {
  const command = extractCommand(message.text ?? '');
  if (command) {
    const commandMatch = documents.find((doc) => {
      const body = getTriggerFunctionBodyData(doc);
      return (
        body?.triggerName === TELEGRAM_ON_COMMAND_TRIGGER_NAME &&
        normalizeCommandName(body.triggerConfig?.[TELEGRAM_COMMAND_FIELD_NAME] ?? '') === command
      );
    });
    if (commandMatch) return commandMatch;
  }
  return documents.find((doc) => getTriggerFunctionBodyData(doc)?.triggerName === TELEGRAM_TRIGGER_NAME);
};

/**
 * Fallback only — used when a callback query arrives for a chat this process has no memory of (see
 * `TChatTriggerMap` below), e.g. right after a restart. Picks the same on-message trigger-function a
 * plain message would fall back to (or, absent one, the first bound trigger-function) rather than
 * trying to match a command.
 */
const selectPrimaryTriggerFunction = (
  documents: readonly IIntegrationDocumentRecord[],
): IIntegrationDocumentRecord | undefined =>
  documents.find((doc) => getTriggerFunctionBodyData(doc)?.triggerName === TELEGRAM_TRIGGER_NAME) ?? documents[0];

/**
 * Chat id -> the `trigger-function` document id whose workflow is actually running that chat's
 * conversation, remembered from the most recent inbound message. A button press carries no
 * information about which bound trigger-function started it, and `ctx.signalWorkflow` is a
 * `signalWithStart` (see `@falang/workflow-gateway`'s `gateway.module.ts`) — guessing wrong doesn't
 * just fail to deliver the answer, it silently starts a *new*, unrelated workflow execution while the
 * real one sits blocked on `condition()` forever. Closure-scoped, per target/process — same tolerance
 * as the poll-mode `offset` below: lost on restart, falls back to `selectPrimaryTriggerFunction`'s
 * heuristic (correct again once exactly one trigger-function is bound, wrong when several are).
 */
type TChatTriggerMap = Map<number, string>;

const selectTriggerFunctionForCallback = (
  documents: readonly IIntegrationDocumentRecord[],
  chatId: number,
  chatTriggerFunctions: TChatTriggerMap,
): IIntegrationDocumentRecord | undefined => {
  const rememberedId = chatTriggerFunctions.get(chatId);
  const remembered = rememberedId && documents.find((doc) => doc.id === rememberedId);
  return remembered || selectPrimaryTriggerFunction(documents);
};

/**
 * Input that matches no bound trigger function has no workflow to belong to, but a journal entry needs a workflow id —
 * `tg-unbound-<chatId>` keeps it per chat, shown in that conversation's journal view (ADR 0059 (private) §2c).
 */
const unboundWorkflowId = (chatId: number): string => `tg-unbound-${chatId}`;

const handleMessage = async (
  ctx: IIntegrationBackendContext,
  message: ITelegramRawMessage,
  chatTriggerFunctions: TChatTriggerMap,
): Promise<void> => {
  const chatId = message.chat.id;
  // Telegram chat ids are always non-zero — a falsy value here means there's no chat to reply to.
  if (!chatId) return;

  const triggerFunctionDocuments = await findBoundTriggerFunctions(ctx);
  const triggerFunction = selectTriggerFunctionForMessage(triggerFunctionDocuments, message);
  if (!triggerFunction) {
    await ctx.reportJournalProblem?.({
      workflowId: unboundWorkflowId(chatId),
      level: 'info',
      message: 'Ignored a message: no trigger function is bound to this bot for it',
      data: { errorType: 'NoBoundTrigger', signal: TELEGRAM_SIGNAL_NAME, payload: toTelegramMessage(message) },
    });
    return;
  }
  chatTriggerFunctions.set(chatId, triggerFunction.id);

  // Resolved eagerly, before signalling, so the compiled workflow just reads `message.photo`/etc. and
  // gets a ready-to-use `files/File` — see `telegram-media.ts`'s `resolveIncomingMedia` and
  // ADR 0038 (private) §5.
  const media = await resolveIncomingMedia(message, {
    botToken: ctx.fields.botToken,
    apiBaseUrl: TELEGRAM_API_BASE_URL,
    uploadFile: ctx.uploadFile,
  });

  await ctx.signalWorkflow({
    workflowId: `tg-${triggerFunction.id}-${chatId}`,
    workflowType: triggerFunction.name,
    signalName: TELEGRAM_SIGNAL_NAME,
    signalArgs: [{ ...toTelegramMessage(message), ...media }],
  });
};

/**
 * Telegram shows a loading spinner on the pressed button until `answerCallbackQuery` is called (or
 * its own timeout elapses) — acked immediately here rather than only after the workflow round-trip
 * (which waits on `condition()` inside the compiled `telegram-question` node, see
 * `@falang/workflow-compiler`'s `question-emitters.ts`), so the button doesn't look stuck.
 */
const answerCallbackQuery = async (botToken: string, callbackQueryId: string): Promise<void> => {
  await fetch(telegramApiUrl(botToken, 'answerCallbackQuery'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
};

/**
 * Normalizes a button press into the fixed `{ messageId, value }` contract every vendor's
 * `IQuestionDescriptor.answerSignalName` payload uses (see `@falang/workflow-integrations-common`'s
 * `types.ts`) — the compiled workflow correlates this to a specific pending `telegram-question` node
 * by `messageId` alone, never by inspecting vendor-specific shape.
 */
const handleCallbackQuery = async (
  ctx: IIntegrationBackendContext,
  callbackQuery: ITelegramCallbackQuery,
  chatTriggerFunctions: TChatTriggerMap,
): Promise<void> => {
  const botToken = ctx.fields.botToken;
  if (botToken) await answerCallbackQuery(botToken, callbackQuery.id);

  const chatId = callbackQuery.message?.chat.id;
  // Telegram callback_data is always a non-empty string (1-64 bytes) when a button carries one — a falsy value here means there's nothing to correlate to a pending question.
  if (!chatId || !callbackQuery.data) return;

  const triggerFunctionDocuments = await findBoundTriggerFunctions(ctx);
  const triggerFunction = selectTriggerFunctionForCallback(triggerFunctionDocuments, chatId, chatTriggerFunctions);
  if (!triggerFunction) {
    await ctx.reportJournalProblem?.({
      workflowId: unboundWorkflowId(chatId),
      level: 'warn',
      message: 'Ignored a button press: no trigger function is bound to this bot to receive it',
      data: {
        errorType: 'NoBoundTrigger',
        signal: TELEGRAM_QUESTION_ANSWER_SIGNAL_NAME,
        payload: { messageId: String(callbackQuery.message?.message_id), value: callbackQuery.data },
      },
    });
    return;
  }

  await ctx.signalWorkflow({
    workflowId: `tg-${triggerFunction.id}-${chatId}`,
    workflowType: triggerFunction.name,
    signalName: TELEGRAM_QUESTION_ANSWER_SIGNAL_NAME,
    signalArgs: [{ messageId: String(callbackQuery.message?.message_id), value: callbackQuery.data }],
  });
};

const handleUpdate = async (
  ctx: IIntegrationBackendContext,
  update: ITelegramUpdate,
  chatTriggerFunctions: TChatTriggerMap,
): Promise<void> => {
  if (update.callback_query) {
    await handleCallbackQuery(ctx, update.callback_query, chatTriggerFunctions);
    return;
  }
  if (update.message) await handleMessage(ctx, update.message, chatTriggerFunctions);
};

const getUpdates = async (botToken: string, offset: number): Promise<readonly ITelegramUpdate[]> => {
  const url = new URL(telegramApiUrl(botToken, 'getUpdates'));
  url.searchParams.set('timeout', String(TELEGRAM_POLL_TIMEOUT_SECONDS));
  // Telegram update ids are always positive, so a falsy `offset` unambiguously means "no offset stored yet".
  if (offset) url.searchParams.set('offset', String(offset));
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Telegram getUpdates failed: ${response.status} ${await response.text()}`);
  }
  const payload = (await response.json()) as { readonly result?: readonly ITelegramUpdate[] };
  return payload.result ?? [];
};

/**
 * Drives Telegram's Bot API (`setWebhook`/`getUpdates`/`deleteWebhook`) for one credential/env — the
 * vendor half of the host's webhook-vs-poll switch (see `@falang/workflow-integrations-common`'s
 * `IIntegrationBackendContext` and ADR 0006 (private)). Offsets
 * are kept in this closure only (per-process, per-target) — a target restart re-polls from Telegram's
 * own retained backlog (`getUpdates` without an `offset` returns everything not yet confirmed).
 */
export const registerTelegramBackend: TRegisterIntegrationBackend = async (ctx) => {
  const botToken = ctx.fields.botToken;
  if (!botToken) return noopDispose;

  const chatTriggerFunctions: TChatTriggerMap = new Map();

  if (ctx.webhookUrl) {
    const webhookUrl = ctx.webhookUrl;
    ctx.registerWebHook('', async (request) => {
      const update = (await request.json()) as ITelegramUpdate;
      await handleUpdate(ctx, update, chatTriggerFunctions);
      return new Response(null, { status: 200 });
    });
    const response = await fetch(telegramApiUrl(botToken, 'setWebhook'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    });
    if (!response.ok) {
      throw new Error(`Telegram setWebhook failed: ${response.status} ${await response.text()}`);
    }
    return async () => {
      await fetch(telegramApiUrl(botToken, 'deleteWebhook'), { method: 'POST' });
    };
  }

  // Telegram rejects `getUpdates` with a 409 while a webhook is registered — clear it once up front to
  // guarantee a clean switch away from a previously webhook-configured bot.
  await fetch(telegramApiUrl(botToken, 'deleteWebhook'), { method: 'POST' });
  // Telegram update ids are always positive, so 0 unambiguously means "no offset stored yet" — see `getUpdates`.
  let offset = 0;
  ctx.registerInterval(async () => {
    const updates = await getUpdates(botToken, offset);
    for (const update of updates) {
      offset = update.update_id + 1;
      // oxlint-disable-next-line no-await-in-loop -- updates must be signalled in order, one at a time, to keep `offset` correct if a later one throws.
      await handleUpdate(ctx, update, chatTriggerFunctions);
    }
  }, POLL_INTERVAL_MS);
  // Nothing to unregister remotely in poll mode — the host clears the interval itself on stop.
  return noopDispose;
};

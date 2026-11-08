// oxlint-disable max-lines -- over the default cap by the run-journal reports for unroutable input (ADR 0059 (private) §2c).
import { TRIGGER_FUNCTION_BODY_NAME, TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import {
  buildConversationWorkflowId,
  chatTypeAdmits,
  constantTimeEqual,
  decodeButtonCommand,
  resolveChatTypeFilter,
  resolveConversationMode,
  type IIntegrationBackendContext,
  type IIntegrationDocumentRecord,
  type TChatKind,
  type TConversationMode,
  type TRegisterIntegrationBackend,
} from '@falang/workflow-integrations-common';
import {
  TELEGRAM_ALLOWED_UPDATES,
  TELEGRAM_COMMAND_FIELD_NAME,
  TELEGRAM_ON_COMMAND_TRIGGER_NAME,
  TELEGRAM_QUESTION_ANSWER_SIGNAL_NAME,
  TELEGRAM_SIGNAL_NAME,
  TELEGRAM_TRIGGER_NAME,
} from './constants.js';
import { resolveIncomingMedia } from './telegram-media.js';
import {
  classifyChatMemberUpdate,
  classifyServiceMessage,
  deliverJoinRequest,
  deliverMemberEvents,
  isServiceMemberMessage,
  MemberEventDeduplicator,
  type IMemberEventContext,
  type ITelegramRawChatJoinRequest,
  type ITelegramRawChatMemberUpdated,
} from './telegram-member-events.js';
import { reportBotMembershipChange, type ITelegramRawMyChatMemberUpdated } from './telegram-bot-membership.js';
import { toTelegramMessage, type ITelegramRawMessage } from './telegram-message-mapper.js';

/** Telegram's own long-poll timeout (seconds) — `getUpdates` blocks server-side for roughly this long when idle. */
const TELEGRAM_POLL_TIMEOUT_SECONDS = 30;
/** Gap between successive polls — negligible on top of `getUpdates`' own server-side blocking wait above. */
export const POLL_INTERVAL_MS = 1000;

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

export interface ITelegramUpdate {
  readonly update_id: number;
  readonly message?: ITelegramRawMessage;
  readonly callback_query?: ITelegramCallbackQuery;
  readonly chat_member?: ITelegramRawChatMemberUpdated;
  readonly my_chat_member?: ITelegramRawMyChatMemberUpdated;
  readonly chat_join_request?: ITelegramRawChatJoinRequest;
}

/**
 * Overridable so e2e tests can point this at `@falang/workflow-mocks`'s Telegram mock instead of the
 * real Bot API. Guarded by `typeof process` because this module is also reached from the browser
 * bundle (`@falang/workflow-client` imports `registerTelegramBackend` via this package's barrel
 * export), where the Node `process` global doesn't exist.
 */
export const TELEGRAM_API_BASE_URL =
  typeof process === 'undefined'
    ? 'https://api.telegram.org'
    : (process.env.TELEGRAM_API_BASE_URL ?? 'https://api.telegram.org');

export const telegramApiUrl = (token: string, method: string): string =>
  `${TELEGRAM_API_BASE_URL}/bot${token}/${method}`;

export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';
const TELEGRAM_WEBHOOK_SECRET_LABEL = 'telegram-webhook';

// oxlint-disable-next-line no-empty-function -- shared no-op dispose for targets with nothing to tear down remotely (missing bot token, poll mode — see call sites below).
const noopDispose = async (): Promise<void> => {};

/** `trigger-function`'s childTuple is `[function-header, trigger-function-body, function-footer]` — see `@falang/workflow-dto`. */
export const getTriggerFunctionBodyData = (doc: IIntegrationDocumentRecord): ITriggerFunctionBodyData | undefined => {
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

/** Telegram `chat.type` -> the vendor-neutral kind `chatType` filters on: `private` stays, group/supergroup/channel are `group`. */
const chatKindOf = (chatType: string): TChatKind => (chatType === 'private' ? 'private' : 'group');

/** The trigger document's `chatType` filter admits this chat (a missing/unknown value means `any`). */
const admitsChat = (doc: IIntegrationDocumentRecord, kind: TChatKind): boolean =>
  chatTypeAdmits(resolveChatTypeFilter(getTriggerFunctionBodyData(doc)?.triggerConfig), kind);

/**
 * At most one `trigger-function` is signalled per incoming message: a bound on-command trigger whose
 * configured command matches the message's leading `/command` wins over the catch-all on-message
 * trigger (if both are bound to the same credential) — mirrors the common bot-framework convention
 * that a specific command handler takes priority over a generic message handler. Both kinds respect their
 * `chatType` filter (ADR 0076 (private) §2), so e.g. one on-message document for private chats and another for
 * groups can coexist: the first one whose filter admits the chat wins.
 */
const selectTriggerFunctionForMessage = (
  documents: readonly IIntegrationDocumentRecord[],
  message: ITelegramRawMessage,
): IIntegrationDocumentRecord | undefined => {
  const kind = chatKindOf(message.chat.type);
  const command = extractCommand(message.text ?? '');
  if (command) {
    const commandMatch = documents.find((doc) => {
      const body = getTriggerFunctionBodyData(doc);
      return (
        body?.triggerName === TELEGRAM_ON_COMMAND_TRIGGER_NAME &&
        normalizeCommandName(body.triggerConfig?.[TELEGRAM_COMMAND_FIELD_NAME] ?? '') === command &&
        admitsChat(doc, kind)
      );
    });
    if (commandMatch) return commandMatch;
  }
  return documents.find(
    (doc) => getTriggerFunctionBodyData(doc)?.triggerName === TELEGRAM_TRIGGER_NAME && admitsChat(doc, kind),
  );
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

/** What a chat's conversation was last started with: the document, its full workflow id and conversation mode. */
interface IChatConversation {
  readonly documentId: string;
  readonly workflowId: string;
  readonly mode: TConversationMode;
}

/**
 * Chat id -> the conversation that is actually running in that chat, remembered from the most recent inbound message.
 * A button press carries no information about which bound trigger-function started it, and `ctx.signalWorkflow` is a
 * `signalWithStart` (see `@falang/workflow-gateway`'s `gateway.module.ts`) — guessing wrong doesn't
 * just fail to deliver the answer, it silently starts a *new*, unrelated workflow execution while the
 * real one sits blocked on `condition()` forever. It stores the full workflow id (not only the document), so a
 * `per-user` private conversation is reached too. Closure-scoped, per target/process — same tolerance
 * as the poll-mode `offset` below: lost on restart, falls back to `selectPrimaryTriggerFunction`'s
 * heuristic (correct again once exactly one trigger-function is bound, wrong when several are).
 */
type TChatTriggerMap = Map<number, IChatConversation>;

/** Per-target state of the ingress. */
interface ITelegramIngressState {
  readonly chatTriggerFunctions: TChatTriggerMap;
  readonly memberDedup: MemberEventDeduplicator;
}

const createIngressState = (): ITelegramIngressState => ({
  chatTriggerFunctions: new Map(),
  memberDedup: new MemberEventDeduplicator(),
});

/**
 * Input that matches no bound trigger function has no workflow to belong to, but a journal entry needs a workflow id —
 * `tg-unbound-<chatId>` keeps it per chat, shown in that conversation's journal view (ADR 0059 (private) §2c).
 */
const unboundWorkflowId = (chatId: number): string => `tg-unbound-${chatId}`;

const handleMessage = async (
  ctx: IIntegrationBackendContext,
  message: ITelegramRawMessage,
  updateId: number,
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
  const mode = resolveConversationMode(getTriggerFunctionBodyData(triggerFunction)?.triggerConfig);
  const workflowId = buildConversationWorkflowId({
    vendorPrefix: 'tg',
    documentId: triggerFunction.id,
    chatId,
    // A message with no sender (channel posts) cannot key a `per-user` conversation: fall back to the chat.
    userId: message.from?.id ?? chatId,
    eventKey: updateId,
    mode,
  });
  chatTriggerFunctions.set(chatId, { documentId: triggerFunction.id, workflowId, mode });

  // Resolved eagerly, before signalling, so the compiled workflow just reads `message.photo`/etc. and
  // gets a ready-to-use `files/File` — see `telegram-media.ts`'s `resolveIncomingMedia` and
  // ADR 0038 (private) §5.
  const media = await resolveIncomingMedia(message, {
    botToken: ctx.fields.botToken,
    apiBaseUrl: TELEGRAM_API_BASE_URL,
    uploadFile: ctx.uploadFile,
  });

  await ctx.signalWorkflow({
    workflowId,
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

type TCallbackRoute =
  | { readonly kind: 'unbound' }
  | {
      readonly kind: 'unroutable';
      readonly errorType: string;
      readonly message: string;
      readonly mode: TConversationMode;
    }
  | { readonly kind: 'route'; readonly document: IIntegrationDocumentRecord; readonly workflowId: string };

/**
 * Which run a button press belongs to: the chat's remembered conversation when this process has one (its full workflow
 * id — also right for a `per-user`/`per-event` private chat), else a rebuild from the primary document's mode.
 * ADR 0076 (private) §2: until the pending-question registry (phase 2) a group answer can only be routed by chat, which
 * is impossible once a group has a workflow per member or per message.
 */
const routeCallback = (
  documents: readonly IIntegrationDocumentRecord[],
  callbackQuery: ITelegramCallbackQuery,
  chatId: number,
  chatTriggerFunctions: TChatTriggerMap,
): TCallbackRoute => {
  const remembered = chatTriggerFunctions.get(chatId);
  const rememberedDoc = remembered && documents.find((doc) => doc.id === remembered.documentId);
  const document = rememberedDoc || selectPrimaryTriggerFunction(documents);
  if (!document) return { kind: 'unbound' };

  const mode =
    rememberedDoc && remembered
      ? remembered.mode
      : resolveConversationMode(getTriggerFunctionBodyData(document)?.triggerConfig);
  const isGroup = chatKindOf(callbackQuery.message?.chat.type ?? 'private') === 'group';
  if (isGroup && mode !== 'per-chat') {
    return {
      kind: 'unroutable',
      errorType: 'UnroutableGroupAnswer',
      message:
        'Ignored a button press: a button pressed in a group cannot be routed to its conversation before pending-question routing (phase 2)',
      mode,
    };
  }
  if (rememberedDoc && remembered) return { kind: 'route', document, workflowId: remembered.workflowId };
  // After a restart: rebuild the id from the document's mode. A private chat is its own user; a `per-event` run cannot be guessed.
  if (mode === 'per-event') {
    return {
      kind: 'unroutable',
      errorType: 'UnroutableAnswer',
      message: 'Ignored a button press: the per-event conversation it belongs to is not known after a restart',
      mode,
    };
  }
  const workflowId = buildConversationWorkflowId({
    vendorPrefix: 'tg',
    documentId: document.id,
    chatId,
    userId: callbackQuery.from?.id ?? chatId,
    mode,
  });
  return { kind: 'route', document, workflowId };
};

/**
 * A command button of `telegram-send-buttons` (`callback_data` = `falang-cmd:<command>`): delivered exactly like the
 * presser typing that command in the chat — the same routing (an on-command trigger wins, conversation modes,
 * `chatType`), so it also works in groups, where a question answer cannot be routed yet.
 */
const handleCommandButton = async (
  ctx: IIntegrationBackendContext,
  callbackQuery: ITelegramCallbackQuery,
  command: string,
  updateId: number,
  chatTriggerFunctions: TChatTriggerMap,
): Promise<void> => {
  const source = callbackQuery.message;
  if (!source) return;
  const message: ITelegramRawMessage = {
    message_id: source.message_id,
    date: Math.floor(Date.now() / 1000),
    chat: source.chat,
    ...(callbackQuery.from ? { from: callbackQuery.from } : {}),
    text: command,
  };
  await handleMessage(ctx, message, updateId, chatTriggerFunctions);
};

/**
 * Normalizes a button press into the fixed `{ messageId, value }` contract every vendor's
 * `IQuestionDescriptor.answerSignalName` payload uses (see `@falang/workflow-integrations-common`'s
 * `types.ts`) — the compiled workflow correlates this to a specific pending `telegram-question` node
 * by `messageId` alone, never by inspecting vendor-specific shape. A command button is a message instead, see
 * `handleCommandButton`.
 */
const handleCallbackQuery = async (
  ctx: IIntegrationBackendContext,
  callbackQuery: ITelegramCallbackQuery,
  updateId: number,
  chatTriggerFunctions: TChatTriggerMap,
): Promise<void> => {
  const botToken = ctx.fields.botToken;
  if (botToken) await answerCallbackQuery(botToken, callbackQuery.id);

  const chatId = callbackQuery.message?.chat.id;
  // Telegram callback_data is always a non-empty string (1-64 bytes) when a button carries one — a falsy value here means there's nothing to correlate to a pending question.
  if (!chatId || !callbackQuery.data) return;

  const command = decodeButtonCommand(callbackQuery.data);
  if (command) {
    await handleCommandButton(ctx, callbackQuery, command, updateId, chatTriggerFunctions);
    return;
  }

  const payload = { messageId: String(callbackQuery.message?.message_id), value: callbackQuery.data };
  const route = routeCallback(await findBoundTriggerFunctions(ctx), callbackQuery, chatId, chatTriggerFunctions);
  if (route.kind === 'unbound') {
    await ctx.reportJournalProblem?.({
      workflowId: unboundWorkflowId(chatId),
      level: 'warn',
      message: 'Ignored a button press: no trigger function is bound to this bot to receive it',
      data: { errorType: 'NoBoundTrigger', signal: TELEGRAM_QUESTION_ANSWER_SIGNAL_NAME, payload },
    });
    return;
  }
  if (route.kind === 'unroutable') {
    await ctx.reportJournalProblem?.({
      workflowId: unboundWorkflowId(chatId),
      level: 'warn',
      message: route.message,
      data: { errorType: route.errorType, signal: TELEGRAM_QUESTION_ANSWER_SIGNAL_NAME, payload, mode: route.mode },
    });
    return;
  }

  await ctx.signalWorkflow({
    workflowId: route.workflowId,
    workflowType: route.document.name,
    signalName: TELEGRAM_QUESTION_ANSWER_SIGNAL_NAME,
    signalArgs: [payload],
  });
};

/** Resolves the bound documents once per member update and hands them to the member-event delivery. */
const memberEventContext = async (
  ctx: IIntegrationBackendContext,
  state: ITelegramIngressState,
): Promise<IMemberEventContext> => ({
  ctx,
  documents: await findBoundTriggerFunctions(ctx),
  triggerNameOf: (doc) => getTriggerFunctionBodyData(doc)?.triggerName,
  dedup: state.memberDedup,
});

/**
 * Order matters (ADR 0076 (private) §4): a button press, then member changes, then join requests, the bot's own
 * membership, a member service message — which is consumed here and never reaches an on-message trigger — and last the
 * plain message.
 */
const handleUpdate = async (
  ctx: IIntegrationBackendContext,
  update: ITelegramUpdate,
  state: ITelegramIngressState,
): Promise<void> => {
  if (update.callback_query) {
    await handleCallbackQuery(ctx, update.callback_query, update.update_id, state.chatTriggerFunctions);
    return;
  }
  if (update.chat_member) {
    const event = classifyChatMemberUpdate(update.chat_member);
    if (event) await deliverMemberEvents(await memberEventContext(ctx, state), update.update_id, [event]);
    return;
  }
  if (update.chat_join_request) {
    await deliverJoinRequest(await memberEventContext(ctx, state), update.update_id, update.chat_join_request);
    return;
  }
  if (update.my_chat_member) {
    await reportBotMembershipChange(ctx, update.my_chat_member);
    return;
  }
  const message = update.message;
  if (!message) return;
  if (isServiceMemberMessage(message)) {
    await deliverMemberEvents(await memberEventContext(ctx, state), update.update_id, classifyServiceMessage(message));
    return;
  }
  await handleMessage(ctx, message, update.update_id, state.chatTriggerFunctions);
};

export const getUpdates = async (botToken: string, offset: number): Promise<readonly ITelegramUpdate[]> => {
  const url = new URL(telegramApiUrl(botToken, 'getUpdates'));
  url.searchParams.set('timeout', String(TELEGRAM_POLL_TIMEOUT_SECONDS));
  // Explicit on every poll: `chat_member` is not delivered by default, and an omitted list keeps the previous setting.
  url.searchParams.set('allowed_updates', JSON.stringify(TELEGRAM_ALLOWED_UPDATES));
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

  const state = createIngressState();

  // Sandbox mode (ADR 0073 (private)): the host owns the test bot's only consumer and feeds this target the updates of
  // its bound chats — no webhook, no polling here.
  if (ctx.sharedIngress) {
    ctx.sharedIngress.subscribe((update) => handleUpdate(ctx, update as ITelegramUpdate, state));
    return noopDispose;
  }

  if (ctx.webhookUrl) {
    const webhookUrl = ctx.webhookUrl;
    // Telegram echoes this in `X-Telegram-Bot-Api-Secret-Token` on every delivery; anything else is not Telegram.
    // Derived (HMAC of server key + target identity), so it survives restarts/replicas and `setWebhook` below re-registers it
    // on every activation — already-registered bots get one on their first restart. Fail closed if the host cannot derive one.
    if (!ctx.deriveSecret) throw new Error('Telegram webhook mode needs ctx.deriveSecret (host did not provide it)');
    const secretToken = ctx.deriveSecret(TELEGRAM_WEBHOOK_SECRET_LABEL);
    ctx.registerWebHook('', async (request) => {
      if (!constantTimeEqual(request.headers.get(TELEGRAM_SECRET_HEADER) ?? '', secretToken)) {
        return new Response(null, { status: 401 });
      }
      const update = (await request.json()) as ITelegramUpdate;
      await handleUpdate(ctx, update, state);
      return new Response(null, { status: 200 });
    });
    const response = await fetch(telegramApiUrl(botToken, 'setWebhook'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, secret_token: secretToken, allowed_updates: TELEGRAM_ALLOWED_UPDATES }),
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
      await handleUpdate(ctx, update, state);
    }
  }, POLL_INTERVAL_MS);
  // Nothing to unregister remotely in poll mode — the host clears the interval itself on stop.
  return noopDispose;
};

// oxlint-disable max-lines -- mirrors telegram-backend.ts: routing, both delivery modes and the run-journal reports.
import { TRIGGER_FUNCTION_BODY_NAME, TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import {
  constantTimeEqual,
  type IIntegrationBackendContext,
  type IIntegrationDocumentRecord,
  type TRegisterIntegrationBackend,
} from '@falang/workflow-integrations-common';
import {
  MAX_COMMAND_FIELD_NAME,
  MAX_DEFAULT_API_BASE_URL,
  MAX_ON_COMMAND_TRIGGER_NAME,
  MAX_QUESTION_ANSWER_SIGNAL_NAME,
  MAX_SIGNAL_NAME,
  MAX_TRIGGER_NAME,
} from './constants.js';
import { resolveIncomingMedia } from './max-media.js';
import {
  botStartedToMaxMessage,
  maxChatIdOf,
  toMaxMessage,
  type IMaxMessage,
  type IMaxRawMessage,
  type IMaxRawUser,
} from './max-message-mapper.js';

/** Max's own long-poll timeout (seconds) — `GET /updates` blocks server-side for roughly this long when idle. */
export const MAX_POLL_TIMEOUT_SECONDS = 30;
/** Gap between successive polls; Max allows at most 2 long-poll requests per second. */
export const POLL_INTERVAL_MS = 1000;

/** The update kinds a bot built in falang reacts to — subscribed to explicitly, so Max never sends the rest. */
export const MAX_UPDATE_TYPES = ['message_created', 'message_callback', 'bot_started'] as const;

interface ITriggerFunctionBodyData {
  readonly vendor: string;
  readonly triggerName: string;
  readonly credentialId: string;
  readonly triggerConfig?: Readonly<Record<string, string>>;
}

interface IMaxMessageCreatedUpdate {
  readonly update_type: 'message_created';
  readonly timestamp: number;
  readonly message: IMaxRawMessage;
}

interface IMaxMessageCallbackUpdate {
  readonly update_type: 'message_callback';
  readonly timestamp: number;
  readonly callback: {
    readonly callback_id: string;
    readonly payload?: string;
    readonly user: IMaxRawUser;
  };
  /** The message the pressed button belongs to — `null` in some scenarios, then there's nothing to correlate. */
  readonly message: IMaxRawMessage | null;
}

interface IMaxBotStartedUpdate {
  readonly update_type: 'bot_started';
  readonly timestamp: number;
  readonly chat_id: number;
  readonly user: IMaxRawUser;
  readonly payload?: string | null;
}

type TMaxUpdate =
  | IMaxMessageCreatedUpdate
  | IMaxMessageCallbackUpdate
  | IMaxBotStartedUpdate
  | { readonly update_type: string; readonly timestamp: number };

/**
 * Overridable so e2e tests can point this at `@falang/workflow-mocks`'s Max mock. Guarded by `typeof process` because
 * this module is also reached from the browser bundle through the package barrel (same as `telegram-backend.ts`).
 */
export const MAX_API_BASE_URL =
  typeof process === 'undefined'
    ? MAX_DEFAULT_API_BASE_URL
    : (process.env.MAX_API_BASE_URL ?? MAX_DEFAULT_API_BASE_URL);

/** Max echoes the subscription `secret` in this header on every webhook delivery. */
export const MAX_SECRET_HEADER = 'x-max-bot-api-secret';
const MAX_WEBHOOK_SECRET_LABEL = 'max-webhook';

// oxlint-disable-next-line no-empty-function -- shared no-op dispose for targets with nothing to tear down remotely.
const noopDispose = async (): Promise<void> => {};

/** Query parameters; a `null` value is left out. */
type TQuery = Readonly<Record<string, string | number | null>>;

/** One Max Bot API call: the token goes in `Authorization` (Max no longer accepts it as a query parameter). */
export const maxApiFetch = (
  botToken: string,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  query: TQuery = {},
  body: object | null = null,
): Promise<Response> => {
  const url = new URL(`${MAX_API_BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(query)) if (value !== null) url.searchParams.set(key, String(value));
  const init: RequestInit =
    body === null
      ? { method, headers: { Authorization: botToken } }
      : {
          method,
          headers: { Authorization: botToken, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        };
  return fetch(url, init);
};

const maxApiJson = async <T>(
  botToken: string,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  query: TQuery = {},
  body: object | null = null,
): Promise<T> => {
  const response = await maxApiFetch(botToken, method, path, query, body);
  if (!response.ok) throw new Error(`Max ${method} /${path} failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
};

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

/** A leading `/command`, with an optional `@botUsername` suffix (group chats) stripped. */
const COMMAND_PATTERN = /^\/([a-zA-Z0-9_]+)(?:@\S+)?(?:\s|$)/;

const extractMaxCommand = (text: string): string | undefined => COMMAND_PATTERN.exec(text)?.[1];

/** Tolerates the command being configured with or without its leading slash. */
const normalizeCommandName = (value: string): string => value.trim().replace(/^\//, '');

/** A bound on-command trigger whose command matches wins over the catch-all on-message trigger (same rule as Telegram). */
const selectTriggerFunctionForMessage = (
  documents: readonly IIntegrationDocumentRecord[],
  text: string,
): IIntegrationDocumentRecord | undefined => {
  const command = extractMaxCommand(text);
  if (command) {
    const commandMatch = documents.find((doc) => {
      const body = getTriggerFunctionBodyData(doc);
      return (
        body?.triggerName === MAX_ON_COMMAND_TRIGGER_NAME &&
        normalizeCommandName(body.triggerConfig?.[MAX_COMMAND_FIELD_NAME] ?? '') === command
      );
    });
    if (commandMatch) return commandMatch;
  }
  return documents.find((doc) => getTriggerFunctionBodyData(doc)?.triggerName === MAX_TRIGGER_NAME);
};

const selectPrimaryTriggerFunction = (
  documents: readonly IIntegrationDocumentRecord[],
): IIntegrationDocumentRecord | undefined =>
  documents.find((doc) => getTriggerFunctionBodyData(doc)?.triggerName === MAX_TRIGGER_NAME) ?? documents[0];

/**
 * Chat id -> the `trigger-function` document whose workflow runs that chat's conversation, remembered from the most
 * recent inbound message — a button press doesn't say which trigger started the conversation, and guessing wrong would
 * `signalWithStart` an unrelated new workflow. Per target/process, lost on restart (see `telegram-backend.ts`).
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

/** Workflow id for journal entries about input no trigger function takes (ADR 0059 (private) §2c). */
const unboundWorkflowId = (chatId: number): string => `max-unbound-${chatId}`;

const signalIncomingMessage = async (
  ctx: IIntegrationBackendContext,
  message: IMaxMessage,
  raw: IMaxRawMessage | null,
  chatTriggerFunctions: TChatTriggerMap,
): Promise<void> => {
  const chatId = message.chat.id;
  // Max chat ids are never zero — a falsy value means there's no chat to reply to.
  if (!chatId) return;

  const triggerFunction = selectTriggerFunctionForMessage(await findBoundTriggerFunctions(ctx), message.text ?? '');
  if (!triggerFunction) {
    await ctx.reportJournalProblem?.({
      workflowId: unboundWorkflowId(chatId),
      level: 'info',
      message: 'Ignored a message: no trigger function is bound to this bot for it',
      data: { errorType: 'NoBoundTrigger', signal: MAX_SIGNAL_NAME, payload: message },
    });
    return;
  }
  chatTriggerFunctions.set(chatId, triggerFunction.id);

  const media = raw
    ? await resolveIncomingMedia(raw, {
        botToken: ctx.fields.botToken,
        apiBaseUrl: MAX_API_BASE_URL,
        uploadFile: ctx.uploadFile,
      })
    : {};

  await ctx.signalWorkflow({
    workflowId: `max-${triggerFunction.id}-${chatId}`,
    workflowType: triggerFunction.name,
    signalName: MAX_SIGNAL_NAME,
    signalArgs: [{ ...message, ...media }],
  });
};

/**
 * Acks a button press right away (`POST /answers`) with a short notification naming the pick, so the client doesn't
 * look stuck while the workflow round-trip runs. Best effort — a failed ack never drops the answer.
 */
const answerCallback = async (botToken: string, callbackId: string, notification: string): Promise<void> => {
  try {
    await maxApiFetch(botToken, 'POST', 'answers', { callback_id: callbackId }, { notification });
  } catch {
    // Best effort, see above.
  }
};

/** Normalizes a button press into the fixed `{ messageId, value }` answer contract every question vendor uses. */
const handleCallback = async (
  ctx: IIntegrationBackendContext,
  update: IMaxMessageCallbackUpdate,
  chatTriggerFunctions: TChatTriggerMap,
): Promise<void> => {
  const value = update.callback.payload;
  const botToken = ctx.fields.botToken;
  if (botToken) await answerCallback(botToken, update.callback.callback_id, value || '✓');

  const chatId = update.message ? maxChatIdOf(update.message) : 0;
  const messageId = update.message?.body?.mid;
  if (!chatId || !messageId || !value) return;

  const triggerFunctionDocuments = await findBoundTriggerFunctions(ctx);
  const triggerFunction = selectTriggerFunctionForCallback(triggerFunctionDocuments, chatId, chatTriggerFunctions);
  if (!triggerFunction) {
    await ctx.reportJournalProblem?.({
      workflowId: unboundWorkflowId(chatId),
      level: 'warn',
      message: 'Ignored a button press: no trigger function is bound to this bot to receive it',
      data: { errorType: 'NoBoundTrigger', signal: MAX_QUESTION_ANSWER_SIGNAL_NAME, payload: { messageId, value } },
    });
    return;
  }

  await ctx.signalWorkflow({
    workflowId: `max-${triggerFunction.id}-${chatId}`,
    workflowType: triggerFunction.name,
    signalName: MAX_QUESTION_ANSWER_SIGNAL_NAME,
    signalArgs: [{ messageId, value }],
  });
};

const handleMaxUpdate = async (
  ctx: IIntegrationBackendContext,
  update: TMaxUpdate,
  chatTriggerFunctions: TChatTriggerMap,
): Promise<void> => {
  if (update.update_type === 'message_callback') {
    await handleCallback(ctx, update as IMaxMessageCallbackUpdate, chatTriggerFunctions);
    return;
  }
  if (update.update_type === 'message_created') {
    const raw = (update as IMaxMessageCreatedUpdate).message;
    await signalIncomingMessage(ctx, toMaxMessage(raw), raw, chatTriggerFunctions);
    return;
  }
  if (update.update_type === 'bot_started') {
    const started = update as IMaxBotStartedUpdate;
    const message = botStartedToMaxMessage({
      chatId: started.chat_id,
      user: started.user,
      timestamp: started.timestamp,
      payload: started.payload,
    });
    await signalIncomingMessage(ctx, message, null, chatTriggerFunctions);
  }
};

interface IMaxUpdatesResponse {
  readonly updates?: readonly TMaxUpdate[];
  readonly marker?: number | null;
}

interface IMaxSubscriptionsResponse {
  readonly subscriptions?: readonly { readonly url: string }[];
}

export const getUpdates = (botToken: string, marker: number | null): Promise<IMaxUpdatesResponse> =>
  maxApiJson<IMaxUpdatesResponse>(botToken, 'GET', 'updates', {
    timeout: MAX_POLL_TIMEOUT_SECONDS,
    marker,
    types: MAX_UPDATE_TYPES.join(','),
  });

/** Long polling gets nothing while any webhook subscription exists — drop them all before polling (as max-io does). */
export const deleteAllSubscriptions = async (botToken: string): Promise<void> => {
  const response = await maxApiFetch(botToken, 'GET', 'subscriptions');
  if (!response.ok) return;
  const { subscriptions } = (await response.json()) as IMaxSubscriptionsResponse;
  for (const subscription of subscriptions ?? []) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of subscriptions at most; sequential keeps it simple.
    await maxApiFetch(botToken, 'DELETE', 'subscriptions', { url: subscription.url });
  }
};

/**
 * Drives Max's Bot API for one credential/env: a webhook subscription (`POST /subscriptions` with a derived `secret`,
 * removed on dispose) when the host has a public URL, else long polling of `GET /updates`. The polling `marker` lives in
 * this closure only — on a restart Max hands back only the latest update without a marker, so older ones are lost
 * (Max's own long-polling limitation; webhook mode is the production path).
 */
export const registerMaxBackend: TRegisterIntegrationBackend = async (ctx) => {
  const botToken = ctx.fields.botToken;
  if (!botToken) return noopDispose;

  const chatTriggerFunctions: TChatTriggerMap = new Map();

  // Sandbox mode (ADR 0073 (private)): the host owns the test bot's only consumer and feeds this target the updates of
  // its bound chats — no subscription, no polling here.
  if (ctx.sharedIngress) {
    ctx.sharedIngress.subscribe((update) => handleMaxUpdate(ctx, update as TMaxUpdate, chatTriggerFunctions));
    return noopDispose;
  }

  if (ctx.webhookUrl) {
    const webhookUrl = ctx.webhookUrl;
    if (!ctx.deriveSecret) throw new Error('Max webhook mode needs ctx.deriveSecret (host did not provide it)');
    // base64url of an HMAC — 43 characters of [A-Za-z0-9_-], within Max's secret format (5–256 such characters).
    const secret = ctx.deriveSecret(MAX_WEBHOOK_SECRET_LABEL);
    ctx.registerWebHook('', async (request) => {
      if (!constantTimeEqual(request.headers.get(MAX_SECRET_HEADER) ?? '', secret)) {
        return new Response(null, { status: 401 });
      }
      const update = (await request.json()) as TMaxUpdate;
      await handleMaxUpdate(ctx, update, chatTriggerFunctions);
      return new Response(null, { status: 200 });
    });
    await maxApiJson(
      botToken,
      'POST',
      'subscriptions',
      {},
      {
        url: webhookUrl,
        update_types: MAX_UPDATE_TYPES,
        secret,
      },
    );
    return async () => {
      await maxApiFetch(botToken, 'DELETE', 'subscriptions', { url: webhookUrl });
    };
  }

  await deleteAllSubscriptions(botToken);
  let marker: number | null = null;
  ctx.registerInterval(async () => {
    const { updates, marker: nextMarker } = await getUpdates(botToken, marker);
    if (typeof nextMarker === 'number') marker = nextMarker;
    for (const update of updates ?? []) {
      // oxlint-disable-next-line no-await-in-loop -- updates are signalled in order, one at a time.
      await handleMaxUpdate(ctx, update, chatTriggerFunctions);
    }
  }, POLL_INTERVAL_MS);
  return noopDispose;
};

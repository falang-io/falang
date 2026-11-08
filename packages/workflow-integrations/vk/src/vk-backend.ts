// oxlint-disable max-lines -- mirrors max-backend.ts: routing, both delivery modes and the run-journal reports.
import {
  buildConversationWorkflowId,
  chatTypeAdmits,
  constantTimeEqual,
  normalizeButtonCommand,
  resolveChatTypeFilter,
  resolveConversationMode,
  type IIntegrationBackendContext,
  type IIntegrationDocumentRecord,
  type TChatKind,
  type TConversationMode,
  type TRegisterIntegrationBackend,
} from '@falang/workflow-integrations-common';
import {
  VK_API_VERSION,
  VK_COMMAND_FIELD_NAME,
  VK_DEFAULT_API_BASE_URL,
  VK_ON_COMMAND_TRIGGER_NAME,
  VK_QUESTION_ANSWER_SIGNAL_NAME,
  VK_BUTTON_COMMAND_PAYLOAD_KEY,
  VK_SIGNAL_NAME,
  VK_TRIGGER_NAME,
} from './constants.js';
import { resolveIncomingMedia } from './vk-media.js';
import {
  handleChatMemberAction,
  handleGroupMemberUpdate,
  isVkMemberAction,
  type TVkRawActionMessage,
} from './vk-member-events.js';
import {
  CONVERSATION_PEER_OFFSET,
  parseVkPayload,
  toVkMessage,
  toVkUser,
  type IVkRawMessage,
  type IVkRawUser,
  type IVkUser,
} from './vk-message-mapper.js';
import { findBoundTriggerFunctions, getTriggerFunctionBodyData, unboundWorkflowId } from './vk-trigger-docs.js';

/** `wait` of a Bots Long Poll request (seconds). */
export const VK_LONG_POLL_WAIT_SECONDS = 25;
/** Gap between successive long-poll requests (the loop never overlaps itself). */
export const VK_POLL_INTERVAL_MS = 1000;

const VK_CALLBACK_SECRET_LABEL = 'vk-callback';
/** At most 14 characters. */
const VK_CALLBACK_SERVER_TITLE = 'Falang';

interface IVkMessageNewObject {
  readonly message?: IVkRawMessage;
}

interface IVkMessageEventObject {
  readonly user_id: number;
  readonly peer_id: number;
  readonly event_id: string;
  readonly payload?: unknown;
  readonly conversation_message_id?: number;
}

/** One event as VK delivers it (Long Poll item or Callback API body). */
export interface IVkUpdate {
  readonly type: string;
  readonly object?: unknown;
  readonly group_id?: number;
  readonly secret?: string;
  /** Unique per event, in Callback API and Bots Long Poll alike (ADR 0076 (private)). */
  readonly event_id?: string | number;
}

/**
 * Overridable so e2e tests can point this at `@falang/workflow-mocks`'s VK mock. Guarded by `typeof process` because
 * this module is also reached from the browser bundle through the package barrel (same as `max-backend.ts`).
 */
export const VK_API_BASE_URL =
  typeof process === 'undefined' ? VK_DEFAULT_API_BASE_URL : (process.env.VK_API_BASE_URL ?? VK_DEFAULT_API_BASE_URL);

// oxlint-disable-next-line no-empty-function -- shared no-op dispose for targets with nothing to tear down remotely.
const noopDispose = async (): Promise<void> => {};

type TParams = Readonly<Record<string, string | number | boolean | object | null | undefined>>;

/** One VK API call: `POST <base>/method/<name>?v=…`, the key in `Authorization: Bearer`, a form-urlencoded body. */
export const vkApiFetch = (
  accessToken: string,
  method: string,
  params: TParams = {},
  apiBaseUrl: string = VK_API_BASE_URL,
): Promise<Response> => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // oxlint-disable-next-line no-undefined -- optional params are simply left out of the form.
    if (value === null || value === undefined) continue;
    body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  return fetch(`${apiBaseUrl}/method/${method}?v=${VK_API_VERSION}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
};

/** The `response` of a VK call; throws on a non-2xx answer and on VK's HTTP-200 `{ error }`. */
export const vkApiJson = async <T>(
  accessToken: string,
  method: string,
  params: TParams = {},
  apiBaseUrl: string = VK_API_BASE_URL,
): Promise<T> => {
  const response = await vkApiFetch(accessToken, method, params, apiBaseUrl);
  const text = await response.text();
  if (!response.ok) throw new Error(`VK ${method} failed: ${response.status} ${text}`);
  const data = (text ? JSON.parse(text) : {}) as {
    response?: T;
    error?: { error_code: number; error_msg: string };
  };
  if (data.error) throw new Error(`VK ${method} failed: ${data.error.error_code} ${data.error.error_msg}`);
  return data.response as T;
};

/** The community the key belongs to (`groups.getById` without parameters; v >= 5.139 wraps the list in `groups`). */
export const vkGetGroupId = async (accessToken: string): Promise<number> => {
  const response = await vkApiJson<{ groups?: readonly { id: number }[] } | readonly { id: number }[]>(
    accessToken,
    'groups.getById',
  );
  const list = Array.isArray(response) ? response : ((response as { groups?: readonly { id: number }[] }).groups ?? []);
  const id = list[0]?.id;
  if (!id) throw new Error('VK groups.getById returned no community for this access key');
  return id;
};

export interface IVkLongPollServer {
  readonly server: string;
  readonly key: string;
  readonly ts: string;
}

/** Best effort: switches Bots Long Poll on for the events a falang bot reads. A key without `manage` rights may refuse. */
export const vkEnableLongPoll = async (accessToken: string, groupId: number, memberEvents = false): Promise<void> => {
  try {
    await vkApiJson(accessToken, 'groups.setLongPollSettings', {
      group_id: groupId,
      enabled: 1,
      api_version: VK_API_VERSION,
      message_new: 1,
      message_event: 1,
      ...(memberEvents ? { group_join: 1, group_leave: 1 } : {}),
    });
  } catch {
    // Long Poll may already be configured in the community's settings; the next call tells if it really is not.
  }
};

export const vkGetLongPollServer = (accessToken: string, groupId: number): Promise<IVkLongPollServer> =>
  vkApiJson<IVkLongPollServer>(accessToken, 'groups.getLongPollServer', { group_id: groupId });

export interface IVkLongPollAnswer {
  readonly ts?: string | number;
  readonly updates?: readonly IVkUpdate[];
  /** `1`: the history is stale (take the new `ts`); `2`: the key expired; `3`: key and `ts` are lost. */
  readonly failed?: 1 | 2 | 3;
}

/** One `a_check` request against a Bots Long Poll server (the URL carries its own key — no bearer token). */
export const vkLongPollCheck = async (
  poll: IVkLongPollServer,
  wait: number = VK_LONG_POLL_WAIT_SECONDS,
): Promise<IVkLongPollAnswer> => {
  const url = new URL(poll.server);
  url.searchParams.set('act', 'a_check');
  url.searchParams.set('key', poll.key);
  url.searchParams.set('ts', poll.ts);
  url.searchParams.set('wait', String(wait));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`VK long poll failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as IVkLongPollAnswer;
};

/** A leading `/command`, with an optional `@community` suffix (conversations) stripped. */
const COMMAND_PATTERN = /^\/([a-zA-Z0-9_]+)(?:@\S+)?(?:\s|$)/;

const extractVkCommand = (text: string): string | undefined => COMMAND_PATTERN.exec(text)?.[1];

/** Tolerates the command being configured with or without its leading slash. */
const normalizeCommandName = (value: string): string => value.trim().replace(/^\//, '');

const vkChatKindOf = (peerId: number): TChatKind => (peerId > CONVERSATION_PEER_OFFSET ? 'group' : 'private');

/** The on-message / on-command documents (member triggers never receive a message). */
const isMessageDocument = (doc: IIntegrationDocumentRecord): boolean => {
  const name = getTriggerFunctionBodyData(doc)?.triggerName;
  return name === VK_TRIGGER_NAME || name === VK_ON_COMMAND_TRIGGER_NAME;
};

const admitsChat = (doc: IIntegrationDocumentRecord, kind: TChatKind): boolean =>
  chatTypeAdmits(resolveChatTypeFilter(getTriggerFunctionBodyData(doc)?.triggerConfig), kind);

/**
 * A bound on-command trigger whose command matches wins over the catch-all on-message trigger (same rule as
 * Telegram/MAX); only documents whose `chatType` filter admits the chat take part, so a private-chat and a
 * conversation handler can coexist.
 */
const selectTriggerFunctionForMessage = (
  documents: readonly IIntegrationDocumentRecord[],
  text: string,
  kind: TChatKind,
): IIntegrationDocumentRecord | undefined => {
  const candidates = documents.filter((doc) => admitsChat(doc, kind));
  const command = extractVkCommand(text);
  if (command) {
    const commandMatch = candidates.find((doc) => {
      const body = getTriggerFunctionBodyData(doc);
      return (
        body?.triggerName === VK_ON_COMMAND_TRIGGER_NAME &&
        normalizeCommandName(body.triggerConfig?.[VK_COMMAND_FIELD_NAME] ?? '') === command
      );
    });
    if (commandMatch) return commandMatch;
  }
  return candidates.find((doc) => getTriggerFunctionBodyData(doc)?.triggerName === VK_TRIGGER_NAME);
};

const selectPrimaryTriggerFunction = (
  documents: readonly IIntegrationDocumentRecord[],
  kind: TChatKind,
): IIntegrationDocumentRecord | undefined => {
  const candidates = documents.filter((doc) => isMessageDocument(doc) && admitsChat(doc, kind));
  return candidates.find((doc) => getTriggerFunctionBodyData(doc)?.triggerName === VK_TRIGGER_NAME) ?? candidates[0];
};

/** Which run started a chat's conversation: the full workflow id (not just the document) and the mode it was built with. */
interface IChatTrigger {
  readonly workflowId: string;
  readonly workflowType: string;
  readonly mode: TConversationMode;
}

/** `peer_id` -> the conversation last started there, so a button press finds its run (in memory, per target). */
type TChatTriggerMap = Map<number, IChatTrigger>;

/** Per-target state: which run started each chat's conversation, and the sender names already looked up. */
interface IVkTargetState {
  readonly chatTriggerFunctions: TChatTriggerMap;
  /** `null`: the lookup failed or the sender is not a user; not retried within this target. */
  readonly users: Map<number, IVkUser | null>;
  /** The community id once known (a Callback/Long Poll event also carries `group_id`). */
  groupId?: number;
}

const lookupSender = async (
  ctx: IIntegrationBackendContext,
  state: IVkTargetState,
  userId: number | undefined,
): Promise<IVkUser | undefined> => {
  // Communities (negative ids) and a missing id have no profile to look up.
  if (!userId || userId < 0) return;
  const cached = state.users.get(userId);
  if (cached) return cached;
  if (cached === null) return;
  let user: IVkUser | null = null;
  try {
    const list = await vkApiJson<readonly IVkRawUser[]>(ctx.fields.accessToken, 'users.get', { user_ids: userId });
    user = toVkUser(list[0]) ?? null;
  } catch {
    user = null;
  }
  state.users.set(userId, user);
  if (!user) return;
  return user;
};

/** `<doc>-<peer>` per chat, `…-<from_id>` per user, `…-<event_id>` per event; one place for message and button routing. */
const conversationWorkflowId = (
  doc: IIntegrationDocumentRecord,
  mode: TConversationMode,
  chatId: number,
  userId: number | undefined,
  eventKey: string,
): string => buildConversationWorkflowId({ vendorPrefix: 'vk', documentId: doc.id, chatId, userId, eventKey, mode });

const signalIncomingMessage = async (
  ctx: IIntegrationBackendContext,
  raw: IVkRawMessage,
  update: IVkUpdate,
  state: IVkTargetState,
): Promise<void> => {
  const chatId = raw.peer_id;
  // A peer id is never zero — a falsy value means there's no chat to reply to.
  if (!chatId) return;

  const from = await lookupSender(ctx, state, raw.from_id);
  const message = toVkMessage(raw, from);
  const triggerFunction = selectTriggerFunctionForMessage(
    await findBoundTriggerFunctions(ctx),
    message.text,
    vkChatKindOf(chatId),
  );
  if (!triggerFunction) {
    await ctx.reportJournalProblem?.({
      workflowId: unboundWorkflowId(chatId),
      level: 'info',
      message: 'Ignored a message: no trigger function is bound to this community for it',
      data: { errorType: 'NoBoundTrigger', signal: VK_SIGNAL_NAME, payload: message },
    });
    return;
  }
  const mode = resolveConversationMode(getTriggerFunctionBodyData(triggerFunction)?.triggerConfig);
  // Both transports carry `event_id`; the stand-in only keeps a hand-made event from throwing in per-event mode.
  const eventKey = String(update.event_id ?? `${chatId}-${raw.conversation_message_id ?? raw.id ?? ''}`);
  const workflowId = conversationWorkflowId(triggerFunction, mode, chatId, raw.from_id, eventKey);
  state.chatTriggerFunctions.set(chatId, { workflowId, workflowType: triggerFunction.name, mode });

  const media = await resolveIncomingMedia(raw, { uploadFile: ctx.uploadFile });

  await ctx.signalWorkflow({
    workflowId,
    workflowType: triggerFunction.name,
    signalName: VK_SIGNAL_NAME,
    signalArgs: [{ ...message, ...media }],
  });
};

/** Where a button press goes: the remembered run, else (after a restart) the primary document's conversation id. */
const resolveCallbackTarget = (
  documents: readonly IIntegrationDocumentRecord[],
  event: IVkMessageEventObject,
  state: IVkTargetState,
): IChatTrigger | undefined => {
  const remembered = state.chatTriggerFunctions.get(event.peer_id);
  if (remembered) return remembered;
  const doc = selectPrimaryTriggerFunction(documents, vkChatKindOf(event.peer_id));
  if (!doc) return;
  const mode = resolveConversationMode(getTriggerFunctionBodyData(doc)?.triggerConfig);
  // Only a per-chat id (or, in a private chat, the user's own) can be rebuilt without the message that started the run.
  if (mode === 'per-event') return { workflowId: '', workflowType: doc.name, mode };
  return {
    workflowId: conversationWorkflowId(doc, mode, event.peer_id, event.user_id, ''),
    workflowType: doc.name,
    mode,
  };
};

/**
 * Normalizes a button press into the fixed `{ messageId, value }` answer contract every question vendor uses. A
 * command button of `vk-send-buttons` (payload `{"falangCommand":"/help"}`) is delivered instead exactly like the
 * presser typing that command — same routing as any message, so it also works in conversations.
 */
const handleMessageEvent = async (
  ctx: IIntegrationBackendContext,
  event: IVkMessageEventObject,
  update: IVkUpdate,
  state: IVkTargetState,
): Promise<void> => {
  const accessToken = ctx.fields.accessToken;
  // Must be answered within a minute, else the button keeps spinning. Best effort — a failed ack never drops the answer.
  try {
    await vkApiJson(accessToken, 'messages.sendMessageEventAnswer', {
      event_id: event.event_id,
      user_id: event.user_id,
      peer_id: event.peer_id,
    });
  } catch {
    // Best effort, see above.
  }

  const payload =
    typeof event.payload === 'string'
      ? parseVkPayload(event.payload)
      : ((event.payload as Record<string, unknown> | null | undefined) ?? null);
  const command = payload?.[VK_BUTTON_COMMAND_PAYLOAD_KEY];
  if (typeof command === 'string' && normalizeButtonCommand(command) && event.peer_id) {
    const raw: IVkRawMessage = {
      peer_id: event.peer_id,
      from_id: event.user_id,
      text: normalizeButtonCommand(command),
      date: Math.floor(Date.now() / 1000),
      ...(event.conversation_message_id ? { conversation_message_id: event.conversation_message_id } : {}),
    };
    await signalIncomingMessage(ctx, raw, update, state);
    return;
  }
  const value = payload?.falang;
  const chatId = event.peer_id;
  const messageId = event.conversation_message_id;
  if (typeof value !== 'string' || !chatId || !messageId) return;

  const target = resolveCallbackTarget(await findBoundTriggerFunctions(ctx), event, state);
  if (!target) {
    await ctx.reportJournalProblem?.({
      workflowId: unboundWorkflowId(chatId),
      level: 'warn',
      message: 'Ignored a button press: no trigger function is bound to this community to receive it',
      data: {
        errorType: 'NoBoundTrigger',
        signal: VK_QUESTION_ANSWER_SIGNAL_NAME,
        payload: { messageId: String(messageId), value },
      },
    });
    return;
  }
  // A conversation's per-user / per-event runs cannot be told apart by chat alone until pending-question routing
  // (ADR 0076 (private) phase 2); guessing would silently start a new run with signalWithStart.
  if (vkChatKindOf(chatId) === 'group' && target.mode !== 'per-chat') {
    await ctx.reportJournalProblem?.({
      workflowId: unboundWorkflowId(chatId),
      level: 'warn',
      message:
        'A button pressed in a group cannot be routed to its conversation before pending-question routing (phase 2)',
      data: {
        errorType: 'UnroutableGroupAnswer',
        signal: VK_QUESTION_ANSWER_SIGNAL_NAME,
        payload: { messageId: String(messageId), value },
      },
    });
    return;
  }
  if (!target.workflowId) {
    await ctx.reportJournalProblem?.({
      workflowId: unboundWorkflowId(chatId),
      level: 'warn',
      message: 'Ignored a button press: the run that asked cannot be found after a restart (per-event conversation)',
      data: {
        errorType: 'UnroutableAnswer',
        signal: VK_QUESTION_ANSWER_SIGNAL_NAME,
        payload: { messageId: String(messageId), value },
      },
    });
    return;
  }

  await ctx.signalWorkflow({
    workflowId: target.workflowId,
    workflowType: target.workflowType,
    signalName: VK_QUESTION_ANSWER_SIGNAL_NAME,
    signalArgs: [{ messageId: String(messageId), value }],
  });
};

/** Handles one VK event for a target; exported for the sandbox test-bot host, which feeds bound-chat updates here. */
export const handleVkUpdate = async (
  ctx: IIntegrationBackendContext,
  update: IVkUpdate,
  state?: IVkTargetState,
): Promise<void> => {
  const targetState: IVkTargetState = state ?? { chatTriggerFunctions: new Map(), users: new Map() };
  if (update.type === 'message_new') {
    const object = update.object as (IVkMessageNewObject & Partial<IVkRawMessage>) | null | undefined;
    const raw = object?.message ?? (object as IVkRawMessage | null | undefined);
    // The community's own messages come back as events too.
    if (!raw || raw.out === 1) return;
    // A join/leave service message is a member event, never an on-message input; other service messages carry no text.
    if (isVkMemberAction(raw as TVkRawActionMessage)) {
      await handleChatMemberAction(ctx, update, raw as TVkRawActionMessage);
      return;
    }
    if ((raw as TVkRawActionMessage).action) return;
    await signalIncomingMessage(ctx, raw, update, targetState);
    return;
  }
  if (update.type === 'message_event') {
    await handleMessageEvent(ctx, update.object as IVkMessageEventObject, update, targetState);
    return;
  }
  if (update.type === 'group_join' || update.type === 'group_leave') {
    await handleGroupMemberUpdate(ctx, update, update.group_id ?? targetState.groupId);
  }
};

interface ICallbackServerList {
  readonly items?: readonly { readonly id: number; readonly url: string }[];
}

export interface IVkIngressParams {
  readonly accessToken: string;
  readonly groupId: number;
  /** Also switch on `group_join` / `group_leave` (the production bot; the shared test bot has no use for them). */
  readonly memberEvents?: boolean;
  /** Receives every VK event in order (confirmations and secret checks are done before). */
  onUpdate(update: IVkUpdate): Promise<void>;
}

export interface IVkCallbackIngressParams extends IVkIngressParams {
  readonly webhookUrl: string;
  /** The `secret_key` of the callback server (at most 50 characters), checked on every event. */
  readonly secret: string;
  registerWebHook(handler: (request: Request) => Promise<Response>): void;
}

/**
 * Callback API: a server titled "Falang" is added for `webhookUrl` (old ones with the same URL are removed first) and
 * deleted on dispose. VK calls the URL with `type: confirmation` while `groups.addCallbackServer` runs, so the code is
 * fetched and the handler mounted first. Shared by the production backend and the sandbox test bot.
 */
export const startVkCallbackIngress = async (params: IVkCallbackIngressParams): Promise<() => Promise<void>> => {
  const { accessToken, groupId, webhookUrl, secret } = params;
  const { code } = await vkApiJson<{ code: string }>(accessToken, 'groups.getCallbackConfirmationCode', {
    group_id: groupId,
  });
  params.registerWebHook(async (request) => {
    const update = (await request.json()) as IVkUpdate;
    if (update.type === 'confirmation') return new Response(code, { status: 200 });
    if (!constantTimeEqual(update.secret ?? '', secret)) return new Response(null, { status: 401 });
    await params.onUpdate(update);
    return new Response('ok', { status: 200 });
  });
  const existing = await vkApiJson<ICallbackServerList>(accessToken, 'groups.getCallbackServers', {
    group_id: groupId,
  });
  for (const server of existing.items ?? []) {
    if (server.url !== webhookUrl) continue;
    // oxlint-disable-next-line no-await-in-loop -- a handful of servers at most.
    await vkApiJson(accessToken, 'groups.deleteCallbackServer', { group_id: groupId, server_id: server.id });
  }
  const { server_id: serverId } = await vkApiJson<{ server_id: number }>(accessToken, 'groups.addCallbackServer', {
    group_id: groupId,
    url: webhookUrl,
    title: VK_CALLBACK_SERVER_TITLE,
    secret_key: secret,
  });
  await vkApiJson(accessToken, 'groups.setCallbackSettings', {
    group_id: groupId,
    server_id: serverId,
    api_version: VK_API_VERSION,
    message_new: 1,
    message_event: 1,
    ...(params.memberEvents ? { group_join: 1, group_leave: 1 } : {}),
  });
  return async () => {
    await vkApiJson(accessToken, 'groups.deleteCallbackServer', { group_id: groupId, server_id: serverId });
  };
};

export interface IVkLongPollIngressParams extends IVkIngressParams {
  registerInterval(callback: () => Promise<void>, intervalMs: number): void;
}

/** Bots Long Poll: a non-overlapping loop with `failed` handling; the position lives in this closure only. */
export const startVkLongPollIngress = async (params: IVkLongPollIngressParams): Promise<() => Promise<void>> => {
  const { accessToken, groupId } = params;
  await vkEnableLongPoll(accessToken, groupId, params.memberEvents);
  let poll: IVkLongPollServer | null = null;
  let polling = false;
  params.registerInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      poll ??= await vkGetLongPollServer(accessToken, groupId);
      const answer = await vkLongPollCheck(poll);
      if (answer.failed === 1) {
        poll = { ...poll, ts: String(answer.ts ?? poll.ts) };
        return;
      }
      if (answer.failed === 2) {
        const renewed = await vkGetLongPollServer(accessToken, groupId);
        poll = { ...poll, key: renewed.key };
        return;
      }
      if (answer.failed === 3) {
        poll = await vkGetLongPollServer(accessToken, groupId);
        return;
      }
      // oxlint-disable-next-line no-undefined -- `ts` is absent from some answers.
      if (answer.ts !== undefined) poll = { ...poll, ts: String(answer.ts) };
      for (const update of answer.updates ?? []) {
        // oxlint-disable-next-line no-await-in-loop -- updates are signalled in order, one at a time.
        await params.onUpdate(update);
      }
    } finally {
      polling = false;
    }
  }, VK_POLL_INTERVAL_MS);
  return noopDispose;
};

/**
 * Drives VK for one credential/env: the Callback API (a server added with a derived secret, removed on dispose) when
 * the host has a public URL, else Bots Long Poll. With `ctx.sharedIngress` (sandbox mode) it only subscribes. The Long
 * Poll position lives in this closure only — a restart takes a fresh `ts` from `groups.getLongPollServer`, so events
 * between the stop and the restart are lost (webhook mode is the production path).
 */
export const registerVkBackend: TRegisterIntegrationBackend = async (ctx) => {
  const accessToken = ctx.fields.accessToken;
  if (!accessToken) return noopDispose;

  const state: IVkTargetState = { chatTriggerFunctions: new Map(), users: new Map() };

  // Sandbox mode (ADR 0073 (private)): the host owns the test bot's only consumer and feeds this target the updates of
  // its bound chats — no server, no polling here.
  if (ctx.sharedIngress) {
    ctx.sharedIngress.subscribe((update) => handleVkUpdate(ctx, update as IVkUpdate, state));
    return noopDispose;
  }

  const groupId = await vkGetGroupId(accessToken);
  state.groupId = groupId;
  const onUpdate = (update: IVkUpdate): Promise<void> => handleVkUpdate(ctx, update, state);

  if (ctx.webhookUrl) {
    if (!ctx.deriveSecret) throw new Error('VK webhook mode needs ctx.deriveSecret (host did not provide it)');
    return startVkCallbackIngress({
      accessToken,
      groupId,
      memberEvents: true,
      onUpdate,
      webhookUrl: ctx.webhookUrl,
      // base64url of an HMAC — 43 characters, within VK's `secret_key` limit (50).
      secret: ctx.deriveSecret(VK_CALLBACK_SECRET_LABEL),
      registerWebHook: (handler) => ctx.registerWebHook('', handler),
    });
  }

  return startVkLongPollIngress({
    accessToken,
    groupId,
    memberEvents: true,
    onUpdate,
    registerInterval: (callback, intervalMs) => ctx.registerInterval(callback, intervalMs),
  });
};

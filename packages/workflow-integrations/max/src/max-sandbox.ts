import {
  constantTimeEqual,
  type ISandboxBotAdapter,
  type ISandboxBotInfo,
  type ISandboxIngressContext,
  type ISandboxRelayCall,
  type ISandboxSentMessage,
  type ISandboxUpdateInfo,
  type TSandboxRelayDecision,
} from '@falang/workflow-integrations-common';
import {
  deleteAllSubscriptions,
  getUpdates,
  MAX_API_BASE_URL,
  MAX_SECRET_HEADER,
  MAX_UPDATE_TYPES,
  maxApiFetch,
  POLL_INTERVAL_MS,
} from './max-backend.js';
import type { IMaxRawMessage, IMaxRawUser } from './max-message-mapper.js';

const POST_MESSAGES = 'POST messages';
const MESSAGE_BY_ID_PATTERN = /^\/messages\/([^/]+)$/;
/** Query parameters of `GET /messages` (a chat's history) the relay passes on. */
const LIST_MESSAGES_PARAMS: ReadonlySet<string> = new Set(['chat_id', 'count', 'from', 'to']);

interface IMaxSandboxUpdate {
  readonly update_type?: string;
  readonly chat_id?: number;
  readonly user?: IMaxRawUser;
  readonly payload?: string | null;
  readonly message?: IMaxRawMessage | null;
  readonly callback?: { readonly user?: IMaxRawUser };
  readonly marker?: number;
}

const chatTitleOf = (user: IMaxRawUser | null | undefined): string | null => {
  if (!user) return null;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
  const username = user.username ? `@${user.username}` : '';
  return [name, username].filter(Boolean).join(' ') || null;
};

const userIdOf = (user: IMaxRawUser | null | undefined): string | null => (user?.user_id ? String(user.user_id) : null);

const describeMessage = (message: IMaxRawMessage, text: string | null, user: IMaxRawUser | null | undefined) => {
  const chatId = message.recipient?.chat_id;
  if (!chatId) return null;
  return {
    chatId: String(chatId),
    isPrivateChat: message.recipient.chat_type === 'dialog',
    startPayload: null,
    text,
    chatTitle: chatTitleOf(user),
    userId: userIdOf(message.recipient.chat_type === 'dialog' ? user : null),
  } satisfies ISandboxUpdateInfo;
};

const describeUpdate = (raw: unknown): ISandboxUpdateInfo | null => {
  const update = raw as IMaxSandboxUpdate;
  if (update.update_type === 'bot_started') {
    if (!update.chat_id) return null;
    // A started dialog is always private; the payload comes only from here — a typed `/start fl_…` text is not a link.
    return {
      chatId: String(update.chat_id),
      isPrivateChat: true,
      startPayload: update.payload || null,
      text: null,
      chatTitle: chatTitleOf(update.user),
      userId: userIdOf(update.user),
    };
  }
  if (update.update_type === 'message_created' && update.message) {
    return describeMessage(update.message, update.message.body?.text ?? null, update.message.sender);
  }
  if (update.update_type === 'message_callback') {
    // `message` is null in some scenarios — nothing to route by then.
    return update.message ? describeMessage(update.message, null, update.callback?.user) : null;
  }
  return null;
};

const startIngress = async (ctx: ISandboxIngressContext): Promise<() => Promise<void>> => {
  const { token } = ctx;
  if (ctx.webhookUrl) {
    const webhookUrl = ctx.webhookUrl;
    ctx.registerWebHook(async (request) => {
      if (!constantTimeEqual(request.headers.get(MAX_SECRET_HEADER) ?? '', ctx.secret)) {
        return new Response(null, { status: 401 });
      }
      await ctx.onUpdate(await request.json());
      return new Response(null, { status: 200 });
    });
    const response = await maxApiFetch(
      token,
      'POST',
      'subscriptions',
      {},
      { url: webhookUrl, update_types: MAX_UPDATE_TYPES, secret: ctx.secret },
    );
    if (!response.ok) throw new Error(`Max POST /subscriptions failed: ${response.status} ${await response.text()}`);
    return async () => {
      await maxApiFetch(token, 'DELETE', 'subscriptions', { url: webhookUrl });
    };
  }
  // Long polling gets nothing while any webhook subscription exists.
  await deleteAllSubscriptions(token);
  let marker: number | null = null;
  ctx.registerInterval(async () => {
    const { updates, marker: nextMarker } = await getUpdates(token, marker);
    if (typeof nextMarker === 'number') marker = nextMarker;
    for (const update of updates ?? []) {
      // oxlint-disable-next-line no-await-in-loop -- updates are handed over in order, one at a time.
      await ctx.onUpdate(update);
    }
  }, POLL_INTERVAL_MS);
  // Poll mode has nothing to unregister remotely — the host clears the interval itself.
  // oxlint-disable-next-line no-empty-function -- see above.
  return async () => {};
};

const safeDecode = (value: string): string | null => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};

/** A send (`POST /messages`): exactly one `chat_id` or `user_id`. */
const inspectSend = (search: URLSearchParams, relayToken: string): TSandboxRelayDecision => {
  const chatIds = search.getAll('chat_id');
  const userIds = search.getAll('user_id');
  if (chatIds.length + userIds.length !== 1 || !(chatIds[0] ?? userIds[0])) {
    return { error: 'Exactly one chat_id or user_id is required' };
  }
  // A send by user id: the host resolves the user to the chat bound to the project (`recipientUsers`).
  if (userIds[0]) {
    return { method: POST_MESSAGES, recipients: [], recipientUsers: [userIds[0]], relayToken, sendsMessage: true };
  }
  return { method: POST_MESSAGES, recipients: [chatIds[0]], relayToken, sendsMessage: true };
};

/**
 * Reading a chat's history: exactly one `chat_id` (the host checks it is bound) and paging parameters only — no
 * `message_ids`/`user_id`, which would address messages of other chats of the shared test bot.
 */
const inspectHistoryRead = (search: URLSearchParams, relayToken: string): TSandboxRelayDecision => {
  const chatIds = search.getAll('chat_id');
  if (chatIds.length !== 1 || !chatIds[0]) return { error: 'Exactly one chat_id is required' };
  for (const key of search.keys()) {
    if (!LIST_MESSAGES_PARAMS.has(key)) return { error: `Query parameter ${key} is not allowed` };
  }
  return { method: 'GET messages list', recipients: [chatIds[0]], relayToken };
};

/**
 * The only calls the MAX activities of this package make: send (`POST /messages`, also the question/confirmation
 * texts), strip a question's buttons (`GET /messages/<mid>` + `PUT /messages`), read a chat's history
 * (`GET /messages?chat_id=`; `max-get-message` reuses `GET /messages/<mid>`, so in the sandbox it reads only messages
 * the project itself sent) and the first step of send-file (`POST /uploads`). The relay token is the pod's `Authorization` header.
 */
// oxlint-disable-next-line require-await -- `ISandboxRelay.inspect` is async (Telegram reads the body); MAX decides from method, path and query alone.
const inspect = async (request: Request, path: string): Promise<TSandboxRelayDecision> => {
  const relayToken = request.headers.get('authorization');
  if (!relayToken) return { error: 'Authorization is required' };
  const search = new URL(request.url, 'http://relay.invalid').searchParams;
  const verb = request.method.toUpperCase();

  if (path === '/messages' && verb === 'POST') return inspectSend(search, relayToken);
  if (path === '/messages' && verb === 'PUT') {
    const ids = search.getAll('message_id');
    if (ids.length !== 1 || !ids[0] || search.has('chat_id') || search.has('user_id')) {
      return { error: 'Exactly one message_id (and no chat_id/user_id) is required' };
    }
    return { method: 'PUT messages', recipients: [], messageIds: [ids[0]], relayToken };
  }
  if (path === '/messages' && verb === 'GET') return inspectHistoryRead(search, relayToken);
  const byId = MESSAGE_BY_ID_PATTERN.exec(path);
  if (byId && verb === 'GET') {
    const messageId = safeDecode(byId[1]);
    if (messageId === null) return { error: 'Invalid message id' };
    return { method: 'GET messages', recipients: [], messageIds: [messageId], relayToken };
  }
  if (path === '/uploads' && verb === 'POST') {
    return { method: 'POST uploads', recipients: [], unaddressed: true, relayToken };
  }
  return { error: `${verb} ${path} is not allowed in the test bot` };
};

const sentMessages = (call: ISandboxRelayCall, responseBody: unknown): readonly ISandboxSentMessage[] => {
  if (call.method !== POST_MESSAGES || call.recipients.length !== 1) return [];
  const mid = (responseBody as { message?: { body?: { mid?: unknown } } } | null)?.message?.body?.mid;
  return typeof mid === 'string' && mid ? [{ messageId: mid, chatId: call.recipients[0] }] : [];
};

/**
 * The bot cannot write to the chat: a 403 on a send (the user blocked the bot or never started it), or a 404 whose
 * `code` names the chat or the user (`chat.not.found`, a deleted account).
 */
const isChatUnreachable = (call: ISandboxRelayCall, status: number, responseBody: unknown): boolean => {
  if (call.method !== POST_MESSAGES) return false;
  if (status === 403) return true;
  const code = (responseBody as { code?: unknown } | null | undefined)?.code;
  return status === 404 && typeof code === 'string' && /chat|user|dialog/i.test(code);
};

const getBotInfo = async (token: string): Promise<ISandboxBotInfo> => {
  const response = await maxApiFetch(token, 'GET', 'me');
  const payload = (await response.json().catch(() => null)) as {
    username?: string | null;
    first_name?: string;
    message?: string;
  } | null;
  if (!response.ok || !payload?.username) {
    throw new Error(payload?.message ?? `Max GET /me failed: ${response.status}`);
  }
  return { username: payload.username, title: payload.first_name ?? payload.username };
};

/** MAX's half of the sandbox bot (ADR 0073 (private)); browser-safe like the rest of this package's barrel. */
export const maxSandboxAdapter: ISandboxBotAdapter = {
  tokenField: 'botToken',
  startIngress,
  describeUpdate,
  async sendText(token, chatId, text) {
    const response = await maxApiFetch(token, 'POST', 'messages', { chat_id: chatId }, { text });
    if (!response.ok) throw new Error(`Max POST /messages failed: ${response.status} ${await response.text()}`);
  },
  getBotInfo,
  buildChatLink: (info, payload) => `https://max.ru/${info.username}?start=${encodeURIComponent(payload)}`,
  relay: {
    inspect,
    upstreamUrl: (_token, path, search) => `${MAX_API_BASE_URL}${path}${search}`,
    upstreamHeaders: (token) => ({ Authorization: token }),
    sentMessages,
    isChatUnreachable,
  },
};

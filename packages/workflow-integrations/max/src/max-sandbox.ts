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

const describeMessage = (message: IMaxRawMessage, text: string | null, user: IMaxRawUser | null | undefined) => {
  const chatId = message.recipient?.chat_id;
  if (!chatId) return null;
  return {
    chatId: String(chatId),
    isPrivateChat: message.recipient.chat_type === 'dialog',
    startPayload: null,
    text,
    chatTitle: chatTitleOf(user),
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

/**
 * The only calls the MAX activities of this package make: send (`POST /messages`, also the question/confirmation
 * texts), strip a question's buttons (`GET /messages/<mid>` + `PUT /messages`) and the first step of send-file
 * (`POST /uploads`). The relay token is the pod's `Authorization` header.
 */
// oxlint-disable-next-line require-await -- `ISandboxRelay.inspect` is async (Telegram reads the body); MAX decides from method, path and query alone.
const inspect = async (request: Request, path: string): Promise<TSandboxRelayDecision> => {
  const relayToken = request.headers.get('authorization');
  if (!relayToken) return { error: 'Authorization is required' };
  const search = new URL(request.url, 'http://relay.invalid').searchParams;
  const verb = request.method.toUpperCase();

  if (path === '/messages' && verb === 'POST') {
    const chatIds = search.getAll('chat_id');
    if (search.has('user_id') || chatIds.length !== 1 || !chatIds[0])
      return { error: 'Exactly one chat_id is required' };
    return { method: POST_MESSAGES, recipients: [chatIds[0]], relayToken };
  }
  if (path === '/messages' && verb === 'PUT') {
    const ids = search.getAll('message_id');
    if (ids.length !== 1 || !ids[0] || search.has('chat_id') || search.has('user_id')) {
      return { error: 'Exactly one message_id (and no chat_id/user_id) is required' };
    }
    return { method: 'PUT messages', recipients: [], messageIds: [ids[0]], relayToken };
  }
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
  },
};

import {
  constantTimeEqual,
  type ISandboxBotAdapter,
  type ISandboxBotInfo,
  type ISandboxIngressContext,
  type ISandboxUpdateInfo,
  type TSandboxRelayDecision,
} from '@falang/workflow-integrations-common';
import type { ITelegramRawMessage } from './telegram-message-mapper.js';
import {
  getUpdates,
  POLL_INTERVAL_MS,
  TELEGRAM_API_BASE_URL,
  TELEGRAM_SECRET_HEADER,
  telegramApiUrl,
  type ITelegramUpdate,
} from './telegram-backend.js';

/**
 * The Bot API methods the Telegram activities of this package call (`sendMessage` — send-message, question, answer
 * confirmation, close; `editMessageReplyMarkup` — question resolve/close; `sendPhoto`/`sendVideo`/`sendAudio`/`sendVoice`/
 * `sendDocument` — send-file) plus `sendChatAction`. Anything else is refused by the relay.
 */
export const TELEGRAM_RELAY_METHODS: readonly string[] = [
  'sendMessage',
  'editMessageReplyMarkup',
  'sendPhoto',
  'sendVideo',
  'sendAudio',
  'sendVoice',
  'sendDocument',
  'sendChatAction',
];

const RELAY_PATH_PATTERN = /^\/bot([^/]+)\/([A-Za-z]+)$/;
const START_PATTERN = /^\/start(?:@\S+)?(?:\s+(\S+))?\s*$/;

const postJson = (token: string, method: string, body: unknown): Promise<Response> =>
  fetch(telegramApiUrl(token, method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const chatTitleOf = (from: ITelegramRawMessage['from']): string | null => {
  const name = [from?.first_name, from?.last_name].filter(Boolean).join(' ');
  const username = from?.username ? `@${from.username}` : '';
  return [name, username].filter(Boolean).join(' ') || null;
};

const describeUpdate = (raw: unknown): ISandboxUpdateInfo | null => {
  const update = raw as ITelegramUpdate;
  const message = update.message ?? update.callback_query?.message;
  if (!message?.chat?.id) return null;
  const text = update.message ? (update.message.text ?? null) : null;
  return {
    chatId: String(message.chat.id),
    isPrivateChat: message.chat.type === 'private',
    text,
    startPayload: (text !== null && START_PATTERN.exec(text)?.[1]) || null,
    chatTitle: chatTitleOf(update.message ? update.message.from : update.callback_query?.from),
  };
};

const startIngress = async (ctx: ISandboxIngressContext): Promise<() => Promise<void>> => {
  const { token } = ctx;
  if (ctx.webhookUrl) {
    ctx.registerWebHook(async (request) => {
      if (!constantTimeEqual(request.headers.get(TELEGRAM_SECRET_HEADER) ?? '', ctx.secret)) {
        return new Response(null, { status: 401 });
      }
      await ctx.onUpdate(await request.json());
      return new Response(null, { status: 200 });
    });
    const response = await postJson(token, 'setWebhook', { url: ctx.webhookUrl, secret_token: ctx.secret });
    if (!response.ok) throw new Error(`Telegram setWebhook failed: ${response.status} ${await response.text()}`);
    return async () => {
      await fetch(telegramApiUrl(token, 'deleteWebhook'), { method: 'POST' });
    };
  }
  // getUpdates answers 409 while a webhook is registered.
  await fetch(telegramApiUrl(token, 'deleteWebhook'), { method: 'POST' });
  let offset = 0;
  ctx.registerInterval(async () => {
    const updates = await getUpdates(token, offset);
    for (const update of updates) {
      offset = update.update_id + 1;
      // oxlint-disable-next-line no-await-in-loop -- updates are handed over in order, one at a time, to keep `offset` correct if a later one throws.
      await ctx.onUpdate(update);
    }
  }, POLL_INTERVAL_MS);
  // Poll mode has nothing to unregister remotely — the host clears the interval itself.
  // oxlint-disable-next-line no-empty-function -- see above.
  return async () => {};
};

const recipientOf = (value: unknown): string | null =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : null;

const readChatId = async (request: Request, search: URLSearchParams): Promise<string | null> => {
  const fromQuery = search.get('chat_id');
  if (fromQuery) return fromQuery;
  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      return recipientOf(((await request.json()) as { chat_id?: unknown } | null)?.chat_id);
    }
    if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      const form = await request.formData();
      return recipientOf(form.get('chat_id'));
    }
  } catch {
    return null;
  }
  return null;
};

const inspect = async (request: Request, path: string): Promise<TSandboxRelayDecision> => {
  const match = RELAY_PATH_PATTERN.exec(path);
  if (!match) return { error: 'Unsupported relay path' };
  const [, relayToken, method] = match;
  if (!TELEGRAM_RELAY_METHODS.includes(method)) return { error: `Method ${method} is not allowed in the test bot` };
  const search = new URL(request.url, 'http://relay.invalid').searchParams;
  const chatId = await readChatId(request, search);
  if (!chatId) return { error: 'chat_id is required' };
  return { method, recipients: [chatId], relayToken };
};

const getBotInfo = async (token: string): Promise<ISandboxBotInfo> => {
  const response = await fetch(telegramApiUrl(token, 'getMe'));
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    description?: string;
    result?: { username?: string; first_name?: string };
  } | null;
  if (!response.ok || !payload?.ok || !payload.result?.username) {
    throw new Error(payload?.description ?? `Telegram getMe failed: ${response.status}`);
  }
  return { username: payload.result.username, title: payload.result.first_name ?? payload.result.username };
};

/** Telegram's half of the sandbox bot (ADR 0073 (private)); browser-safe like the rest of this package's barrel. */
export const telegramSandboxAdapter: ISandboxBotAdapter = {
  tokenField: 'botToken',
  startIngress,
  describeUpdate,
  async sendText(token, chatId, text) {
    const response = await postJson(token, 'sendMessage', { chat_id: chatId, text });
    if (!response.ok) throw new Error(`Telegram sendMessage failed: ${response.status} ${await response.text()}`);
  },
  getBotInfo,
  buildChatLink: (info, payload) => `https://t.me/${info.username}?start=${encodeURIComponent(payload)}`,
  relay: {
    inspect,
    upstreamUrl: (token, path, search) => {
      const method = RELAY_PATH_PATTERN.exec(path)?.[2] ?? '';
      return `${TELEGRAM_API_BASE_URL}/bot${token}/${method}${search}`;
    },
  },
};

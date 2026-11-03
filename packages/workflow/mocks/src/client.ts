import type { IMaxMockCall, IMaxMockFileSeed } from './max-mock.js';
import type { IVkMockCall, IVkMockFileSeed } from './vk-mock.js';
import type { IOpenAiMockToolCall } from './openai-mock.js';
import type { ITelegramMockCall, ITelegramMockFileSeed } from './telegram-mock.js';

const postJson = (url: string, body: unknown): Promise<Response> =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/**
 * Queues a fake incoming Telegram update (a `message` or `callback_query`, minus `update_id` — the
 * mock assigns that) for the next `getUpdates` poll of this bot token. `files`, when given, seeds the
 * mock's `getFile`/download routes so a `message.photo`/`.document`/… ref embedded in `update` can
 * actually be resolved into bytes by `telegram-media.ts`'s `resolveIncomingMedia` — see
 * ADR 0038 (private) §5.
 */
export const pushTelegramUpdate = async (
  mocksUrl: string,
  token: string,
  update: Readonly<Record<string, unknown>>,
  files?: readonly ITelegramMockFileSeed[],
): Promise<void> => {
  await postJson(`${mocksUrl}/__mock__/telegram/${token}/updates`, files ? { ...update, files } : update);
};

/** Every outbound Bot API call recorded so far for this bot token (`sendMessage`, `editMessageReplyMarkup`, …). */
export const getTelegramCalls = async (mocksUrl: string, token: string): Promise<readonly ITelegramMockCall[]> => {
  const response = await fetch(`${mocksUrl}/__mock__/telegram/${token}/calls`);
  const body = (await response.json()) as { calls: readonly ITelegramMockCall[] };
  return body.calls;
};

export const resetTelegramMock = async (mocksUrl: string, token: string): Promise<void> => {
  await fetch(`${mocksUrl}/__mock__/telegram/${token}/reset`, { method: 'POST' });
};

/**
 * Queues a fake incoming Max update (`message_created`, `message_callback`, `bot_started`, … — `timestamp` defaults to
 * now) for the next `GET /updates` poll of this bot token. `files` seeds downloadable attachments: reference them in the
 * update as `__MAX_MOCK_BASE__/files/<token>/<path>` (`MAX_MOCK_BASE_PLACEHOLDER`; the mock substitutes its own address as the poller
 * sees it), and a video by its `path` as `payload.token`.
 */
export const pushMaxUpdate = async (
  mocksUrl: string,
  token: string,
  update: Readonly<Record<string, unknown>>,
  files?: readonly IMaxMockFileSeed[],
): Promise<void> => {
  await postJson(
    `${mocksUrl}/__mock__/max/${encodeURIComponent(token)}/updates`,
    files ? { ...update, files } : update,
  );
};

/** Every outbound Bot API call recorded so far for this bot token (`sendMessage`, `editMessage`, `upload`, …). */
export const getMaxCalls = async (mocksUrl: string, token: string): Promise<readonly IMaxMockCall[]> => {
  const response = await fetch(`${mocksUrl}/__mock__/max/${encodeURIComponent(token)}/calls`);
  const body = (await response.json()) as { calls: readonly IMaxMockCall[] };
  return body.calls;
};

export const resetMaxMock = async (mocksUrl: string, token: string): Promise<void> => {
  await fetch(`${mocksUrl}/__mock__/max/${encodeURIComponent(token)}/reset`, { method: 'POST' });
};

/**
 * Queues fake incoming VK Bots Long Poll updates (`{ type: 'message_new', object }`, `message_event`, …; the mock adds
 * `event_id`/`group_id`/`v`) for the next `a_check` of this community token. `files` seeds downloadable attachments:
 * reference them as `__VK_MOCK_BASE__/files/<token>/<path>` (`VK_MOCK_BASE_PLACEHOLDER`).
 */
export const pushVkUpdate = async (
  mocksUrl: string,
  token: string,
  updates: readonly { readonly type: string; readonly object: unknown }[],
  files?: readonly IVkMockFileSeed[],
): Promise<void> => {
  await postJson(
    `${mocksUrl}/__mock__/vk/${encodeURIComponent(token)}/updates`,
    files ? { updates, files } : { updates },
  );
};

/** Every VK API call and upload recorded so far for this token (all methods except `groups.getLongPollServer`). */
export const getVkCalls = async (mocksUrl: string, token: string): Promise<readonly IVkMockCall[]> => {
  const response = await fetch(`${mocksUrl}/__mock__/vk/${encodeURIComponent(token)}/calls`);
  const body = (await response.json()) as { calls: readonly IVkMockCall[] };
  return body.calls;
};

export const resetVkMock = async (mocksUrl: string, token: string): Promise<void> => {
  await fetch(`${mocksUrl}/__mock__/vk/${encodeURIComponent(token)}/reset`, { method: 'POST' });
};

/** Queues the next `/chat/completions` response's `content` string for this `apiKey` — consumed once, in order. */
export const queueOpenAiResponse = async (mocksUrl: string, apiKey: string, content: string): Promise<void> => {
  await postJson(`${mocksUrl}/__mock__/openai/response`, { apiKey, content });
};

/** Queues the next `/chat/completions` response as an assistant turn calling `toolCalls` (the in-app
 *  agent's loop, ADR 0034 (private)) — consumed once, in order, interleaved with `queueOpenAiResponse`. */
export const queueOpenAiToolCalls = async (
  mocksUrl: string,
  apiKey: string,
  toolCalls: readonly IOpenAiMockToolCall[],
  content: string | null = null,
): Promise<void> => {
  await postJson(`${mocksUrl}/__mock__/openai/response`, { apiKey, content, toolCalls });
};

/** Every `/chat/completions` request body received so far for this `apiKey`. */
export const getOpenAiRequests = async (mocksUrl: string, apiKey: string): Promise<readonly unknown[]> => {
  const response = await fetch(`${mocksUrl}/__mock__/openai/requests?apiKey=${encodeURIComponent(apiKey)}`);
  const body = (await response.json()) as { requests: readonly unknown[] };
  return body.requests;
};

export const resetOpenAiMock = async (mocksUrl: string, apiKey: string): Promise<void> => {
  await postJson(`${mocksUrl}/__mock__/openai/reset`, { apiKey });
};

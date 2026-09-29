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

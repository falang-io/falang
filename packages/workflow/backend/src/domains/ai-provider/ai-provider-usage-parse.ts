import { parseOpenAiUsage, type IOpenAiUsage } from '../agent-chat/openai-chat-client.js';
import type { IAiProviderUsage } from './ai-provider-usage-sink.js';

/**
 * Reading `usage` out of a 2xx upstream reply of the built-in AI provider relay (ADR 0081 (private)), one reader per
 * endpoint. Each returns `null` when the body isn't JSON or carries nothing usable — see `IAiProviderUsage` for the
 * shape (tokens `0` = not reported when `images`/`audioSeconds` are set).
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseJson = (body: Uint8Array): unknown => {
  try {
    return JSON.parse(Buffer.from(body).toString('utf8'));
  } catch {
    return null;
  }
};

const finiteNonNegative = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const NO_TOKENS = { completionTokens: 0, promptTokens: 0, totalTokens: 0 } as const;

/**
 * The Responses-style token block (`input_tokens`/`output_tokens`/`total_tokens`, cached input tokens in
 * `input_tokens_details.cached_tokens`) that image generation and token-billed transcription replies carry.
 */
const readInputOutputTokens = (
  usage: Record<string, unknown>,
): Pick<IAiProviderUsage, 'promptTokens' | 'completionTokens' | 'totalTokens' | 'cachedPromptTokens'> | null => {
  const promptTokens = finiteNonNegative(usage.input_tokens);
  const completionTokens = finiteNonNegative(usage.output_tokens);
  if (promptTokens === null || completionTokens === null) return null;
  const total = finiteNonNegative(usage.total_tokens);
  const details = isRecord(usage.input_tokens_details) ? usage.input_tokens_details : null;
  const cached = details ? finiteNonNegative(details.cached_tokens) : null;
  return {
    completionTokens,
    promptTokens,
    totalTokens: total ?? promptTokens + completionTokens,
    ...(cached === null ? {} : { cachedPromptTokens: Math.min(cached, promptTokens) }),
  };
};

/** `POST /chat/completions`: `usage.prompt_tokens`/`completion_tokens`/`total_tokens` (+ cached prompt tokens). */
export const readChatUsage = (body: Uint8Array): IAiProviderUsage | null => {
  const parsed = parseJson(body);
  return isRecord(parsed) ? parseOpenAiUsage(parsed.usage as IOpenAiUsage | undefined) : null;
};

/** `POST /images/generations`: `gpt-image-*` token usage when reported, and the number of images in `data`. */
export const readImageUsage = (body: Uint8Array): IAiProviderUsage | null => {
  const parsed = parseJson(body);
  if (!isRecord(parsed)) return null;
  const tokens = isRecord(parsed.usage) ? readInputOutputTokens(parsed.usage) : null;
  const images = Array.isArray(parsed.data) ? parsed.data.length : null;
  if (!tokens && images === null) return null;
  return { ...(tokens ?? NO_TOKENS), ...(images === null ? {} : { images }) };
};

/** `POST /audio/transcriptions`: `usage` of `type: 'tokens'` (token-billed models) or `type: 'duration'` (`whisper-1`). */
export const readTranscriptionUsage = (body: Uint8Array): IAiProviderUsage | null => {
  const parsed = parseJson(body);
  if (!isRecord(parsed) || !isRecord(parsed.usage)) return null;
  const { usage } = parsed;
  if (usage.type === 'duration') {
    const seconds = finiteNonNegative(usage.seconds);
    return seconds === null ? null : { ...NO_TOKENS, audioSeconds: seconds };
  }
  // `type: 'tokens'`, or an OpenAI-compatible server that omits `type` but reports the same token block.
  return readInputOutputTokens(usage);
};

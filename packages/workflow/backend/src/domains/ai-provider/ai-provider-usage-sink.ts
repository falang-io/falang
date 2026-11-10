import type { TAiProviderModelKind } from '../admin/app-settings/ai-provider-models.js';

/**
 * What the upstream reported for one built-in provider call (ADR 0081 (private)).
 *
 * - `chat`: tokens from `usage` (`prompt_tokens`/`completion_tokens`/`total_tokens`, cached prompt tokens when given).
 * - `image`: tokens from `usage` (`gpt-image-*`: `input_tokens`/`output_tokens`/`total_tokens`, cached input tokens
 *   from `input_tokens_details.cached_tokens`), plus `images` = how many images the reply carried (`data.length`).
 * - `transcribe`: tokens from `usage` of `type: 'tokens'` (`gpt-4o-*-transcribe`), or `audioSeconds` from `usage` of
 *   `type: 'duration'` (`whisper-1`).
 *
 * The token counts are `0` exactly when the reply reported no token usage but something else is known (`images`,
 * `audioSeconds`): `totalTokens === 0` means "not reported", never "free" — a sink pricing per token must price such a
 * call by `images`/`audioSeconds` or per call. A reply with nothing usable at all gives `usage: null` (see
 * {@link IAiProviderAfterCallContext}).
 */
export interface IAiProviderUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  /** The part of `promptTokens` served from the provider's prompt cache, when it reported one. */
  readonly cachedPromptTokens?: number;
  /** Image generation: the number of images returned. */
  readonly images?: number;
  /** Transcription billed by duration (`whisper-1`): the seconds of audio the upstream reported. */
  readonly audioSeconds?: number;
}

export interface IAiProviderCallContext {
  /** The project owner — the payer: a workflow run has no caller (same rule as instance billing). */
  readonly ownerId: string;
  readonly projectId: string;
  readonly env: 'dev' | 'prod';
  /** The model the request asked for (the relay's allowlist has already accepted it). */
  readonly model: string;
  readonly kind: TAiProviderModelKind;
}

export interface IAiProviderAfterCallContext extends IAiProviderCallContext {
  /** What the upstream reported; `null` when the reply carried no usable `usage` (and, for images, no `data` array). */
  readonly usage: IAiProviderUsage | null;
}

/**
 * The seam around every call the built-in AI provider relay makes upstream for a workflow (ADR 0081 (private)). The
 * community edition records usage (`DbAiProviderUsageSink`); the hosted edition charges the owner's balance and
 * refuses calls (402/429/503) — it provides its own `AI_PROVIDER_USAGE_SINK` instead of forking the relay. A seam of
 * its own (not `AGENT_USAGE_SINK`): payer, limits and accounting differ from the in-app agent's.
 *
 * Overriding: export `AI_PROVIDER_USAGE_SINK` from a `@Global()` Nest module imported into `AppModule`. The relay
 * injects the token `@Optional()` and falls back to `DbAiProviderUsageSink`; `AiProviderModule` deliberately does not
 * provide the token itself, which would shadow the global one.
 */
export interface IAiProviderUsageSink {
  /** Runs before the upstream call. Throwing (e.g. `HttpException(402)`) aborts it; the error reaches the pod unchanged. */
  beforeCall: (ctx: IAiProviderCallContext) => Promise<void>;
  /** Runs after a successful upstream call. Errors are logged by the caller and never surfaced. */
  afterCall: (ctx: IAiProviderAfterCallContext) => Promise<void>;
}

export const AI_PROVIDER_USAGE_SINK = Symbol('AI_PROVIDER_USAGE_SINK');

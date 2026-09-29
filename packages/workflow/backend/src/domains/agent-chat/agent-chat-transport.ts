import { Agent } from 'undici';

/**
 * Retry/timeout policy for the one outbound call `AgentChatService` makes to the configured
 * OpenAI-compatible vendor — see ADR 0034 (private)'s "Implementation notes (2026-09-27 — vendor call
 * retries and timeouts)". A real agent run on the dev stand died mid-run with `TypeError: terminated`
 * (cause `read ETIMEDOUT` on the TLS socket — the connection to the vendor dropped at the TCP level
 * while waiting for a long completion), surfaced to the user as a bare "Internal server error". Every
 * already-applied step survives such a failure (ADR 0009), but the run itself was lost to one transient
 * network error.
 */
export interface IAgentChatTransportOptions {
  /** Extra attempts after the first one fails with a retryable error. */
  readonly maxRetries: number;
  /** Per-attempt limit for the whole exchange (connect → headers → full body). */
  readonly timeoutMs: number;
  /** Delay before retry N (1-based) is `baseDelayMs * 2^(N-1)`, unless the vendor sent `Retry-After`. */
  readonly baseDelayMs?: number;
  /** Injected in tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_AGENT_CHAT_MAX_RETRIES = 3;
/** 10 minutes — a large tool-calling request can take several minutes to generate. */
export const DEFAULT_AGENT_CHAT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_BASE_DELAY_MS = 1000;
/** Never wait longer than this between attempts, whatever `Retry-After` says. */
const MAX_RETRY_DELAY_MS = 30_000;

/** Thrown once every attempt failed, or on the first non-retryable vendor response. */
export class AgentChatVendorError extends Error {
  readonly attempts: number;

  constructor(message: string, attempts: number, cause?: unknown) {
    super(message, { cause });
    this.name = 'AgentChatVendorError';
    this.attempts = attempts;
  }
}

/** Node's global `fetch` (undici) cuts headers and body off at 300 s each by default — too short for a
 *  long completion — so every call goes through a dispatcher sized to `timeoutMs`, one per distinct value. */
const dispatchers = new Map<number, Agent>();
const dispatcherFor = (timeoutMs: number): Agent => {
  let dispatcher = dispatchers.get(timeoutMs);
  if (!dispatcher) {
    dispatcher = new Agent({ bodyTimeout: timeoutMs, headersTimeout: timeoutMs });
    dispatchers.set(timeoutMs, dispatcher);
  }
  return dispatcher;
};

/** 408/429/5xx are worth retrying (timeouts, rate limits, overloaded or restarting vendor/proxy); any
 *  other 4xx is a request the vendor will reject again (bad key, bad model, malformed payload). */
const isRetryableStatus = (status: number): boolean => status === 408 || status === 429 || status >= 500;

/** A retryable vendor response, carrying its `Retry-After` delay (if any) to the retry loop. */
interface IRetryableHttpError extends Error {
  readonly retryAfterMs: number | null;
}

const retryableHttpError = (message: string, retryAfterMs: number | null): IRetryableHttpError =>
  Object.assign(new Error(message), { retryAfterMs });

const retryAfterOf = (error: unknown): number | null =>
  error instanceof Error && 'retryAfterMs' in error ? (error as IRetryableHttpError).retryAfterMs : null;

const parseRetryAfterMs = (header: string | null): number | null => {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
};

const describeError = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const { cause } = error;
  const causeText =
    cause instanceof Error ? `${cause.message}${'code' in cause ? ` (${String(cause.code)})` : ''}` : '';
  return causeText ? `${error.message}: ${causeText}` : error.message;
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * POSTs `body` as JSON to `url` and returns the parsed JSON response, retrying up to `maxRetries` times
 * on a network error (`fetch failed`, `terminated`, a reset/timed-out socket), a per-attempt timeout, a
 * truncated/unparseable body, or a retryable status (`isRetryableStatus`). Reading the body is part of
 * the attempt — `terminated` usually strikes there, after the headers already arrived.
 */
export const postJsonWithRetries = async (
  url: string,
  init: { readonly headers: Record<string, string>; readonly body: string },
  options: IAgentChatTransportOptions,
): Promise<unknown> => {
  const sleep = options.sleep ?? defaultSleep;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const attempts = options.maxRetries + 1;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- attempts are sequential by definition
      const response = await fetch(url, {
        body: init.body,
        headers: init.headers,
        method: 'POST',
        signal: AbortSignal.timeout(options.timeoutMs),
        // `dispatcher` is an undici extension to `RequestInit` that Node's global `fetch` honors.
        ...({ dispatcher: dispatcherFor(options.timeoutMs) } as object),
      });
      if (!response.ok) {
        // oxlint-disable-next-line no-await-in-loop
        const text = await response.text().catch(() => '');
        const message = `OpenAI chat completion failed: ${response.status} ${text}`;
        if (!isRetryableStatus(response.status)) throw new AgentChatVendorError(message, attempt);
        throw retryableHttpError(message, parseRetryAfterMs(response.headers.get('retry-after')));
      }
      // oxlint-disable-next-line no-await-in-loop
      return await response.json();
    } catch (error) {
      if (error instanceof AgentChatVendorError) throw error;
      lastError = error;
      if (attempt < attempts) {
        // oxlint-disable-next-line no-await-in-loop
        await sleep(Math.min(retryAfterOf(error) ?? baseDelayMs * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS));
      }
    }
  }
  throw new AgentChatVendorError(
    `AI vendor request failed after ${attempts} attempts: ${describeError(lastError)}`,
    attempts,
    lastError,
  );
};

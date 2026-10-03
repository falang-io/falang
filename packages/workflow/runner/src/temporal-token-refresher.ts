/**
 * Keeps a runner pod's Temporal JWT fresh (ADR 0057 (private)): the Worker authenticates every RPC with
 * the token it holds, and a lapsed token makes it degrade silently (long-polls end, nothing new executes,
 * the process keeps running — live-verified in the phase-0 spike). So the pod fetches its token from
 * `backend` up front, re-fetches it at half its remaining lifetime and pushes it into the live
 * `NativeConnection` (`setApiKey`); if that keeps failing it ends the process (the Deployment restarts
 * the pod) rather than sit there deaf.
 */

export interface ITemporalToken {
  readonly token: string;
  /** ISO timestamp the token stops being valid at. */
  readonly expiresAt: string;
}

export type TFetchTemporalToken = () => Promise<ITemporalToken>;

const INTERNAL_PROJECT_TOKEN_HEADER = 'x-internal-project-token';
const FETCH_TIMEOUT_MS = 10_000;

/** `POST <tokenUrl>` with the pod's own `INTERNAL_PROJECT_TOKEN` — `backend` derives the namespace from the project that token belongs to. */
export const fetchTemporalToken = async (
  tokenUrl: string,
  internalProjectToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ITemporalToken> => {
  const response = await fetchImpl(tokenUrl, {
    method: 'POST',
    headers: { [INTERNAL_PROJECT_TOKEN_HEADER]: internalProjectToken },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch a Temporal token from ${tokenUrl}: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as Partial<ITemporalToken>;
  if (
    typeof body.token !== 'string' ||
    typeof body.expiresAt !== 'string' ||
    Number.isNaN(Date.parse(body.expiresAt))
  ) {
    throw new TypeError(`Temporal token endpoint ${tokenUrl} returned a malformed body`);
  }
  return { token: body.token, expiresAt: body.expiresAt };
};

export interface ITemporalTokenRefresherParams {
  /** The token the connection was opened with. */
  readonly initial: ITemporalToken;
  readonly fetchToken: TFetchTemporalToken;
  /** Pushes a fresh token into the live connection — `NativeConnection.setApiKey`. */
  readonly applyToken: (token: string) => Promise<void>;
  /** Called once when refreshing has failed `maxConsecutiveFailures` times in a row, or the held token has expired. */
  readonly onFatal: (error: Error) => void;
  readonly maxConsecutiveFailures?: number;
  /** Delay before retrying a failed refresh (capped to a quarter of the time the held token has left). */
  readonly retryDelayMs?: number;
  readonly now?: () => number;
  readonly log?: (message: string) => void;
}

const DEFAULT_MAX_CONSECUTIVE_FAILURES = 5;
const DEFAULT_RETRY_DELAY_MS = 5000;
const MIN_DELAY_MS = 200;

export class TemporalTokenRefresher {
  private readonly params: ITemporalTokenRefresherParams;
  private readonly now: () => number;
  private expiresAtMs: number;
  private timer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private stopped = false;

  constructor(params: ITemporalTokenRefresherParams) {
    this.params = params;
    this.now = params.now ?? Date.now;
    this.expiresAtMs = Date.parse(params.initial.expiresAt);
  }

  /** Schedules the first refresh; the initial token is assumed already applied. */
  start(): void {
    this.schedule(Math.max((this.expiresAtMs - this.now()) / 2, MIN_DELAY_MS));
  }

  /** Cancels the pending refresh — call on shutdown so the timer doesn't outlive the Worker. */
  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.refresh().catch((error: unknown) => {
        // `refresh` handles its own failures; this is only a last-resort net against an unexpected throw.
        this.params.onFatal(error instanceof Error ? error : new Error(String(error)));
      });
    }, delayMs);
    this.timer.unref();
  }

  private async refresh(): Promise<void> {
    if (this.stopped) return;
    try {
      const next = await this.params.fetchToken();
      await this.params.applyToken(next.token);
      this.expiresAtMs = Date.parse(next.expiresAt);
      this.consecutiveFailures = 0;
      this.params.log?.(`Temporal token refreshed; valid until ${next.expiresAt}`);
      this.schedule(Math.max((this.expiresAtMs - this.now()) / 2, MIN_DELAY_MS));
    } catch (error) {
      this.consecutiveFailures += 1;
      const cause = error instanceof Error ? error : new Error(String(error));
      const remainingMs = this.expiresAtMs - this.now();
      const max = this.params.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;
      this.params.log?.(
        `Temporal token refresh failed (${this.consecutiveFailures}/${max}, ${Math.max(remainingMs, 0)}ms of validity left): ${cause.message}`,
      );
      if (this.consecutiveFailures >= max || remainingMs <= 0) {
        this.stop();
        this.params.onFatal(
          new Error(
            `Temporal token could not be refreshed (${this.consecutiveFailures} consecutive failures, ${remainingMs <= 0 ? 'token expired' : 'token still valid'}): ${cause.message}`,
          ),
        );
        return;
      }
      this.schedule(
        Math.max(Math.min(this.params.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS, remainingMs / 4), MIN_DELAY_MS),
      );
    }
  }
}

import { GRPC_PERMISSION_DENIED, GRPC_UNAUTHENTICATED, grpcCodeOf } from './temporal-errors.js';

/** One probe: tries a cluster-scope call (`ListNamespaces`) with a given credential and reports what Temporal answered. */
export type TAuthProbe = () => Promise<void>;

export interface IAuthSelfCheckProbes {
  /** No token at all. */
  readonly anonymous: TAuthProbe;
  /** A deliberately wrong token: well-formed `temporal-system:admin` claims, signed by a key Temporal doesn't trust. */
  readonly foreignToken: TAuthProbe;
}

export interface IAuthSelfCheckOptions {
  readonly timeoutMs: number;
  readonly retryDelayMs: number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly warn?: (message: string) => void;
}

export type TAuthSelfCheckOutcome =
  | { readonly status: 'enforced' }
  | { readonly status: 'not-enforced'; readonly failed: readonly string[] }
  | { readonly status: 'unreachable'; readonly message: string };

type TProbeResult = 'denied' | 'allowed' | 'unreachable';

const runProbe = async (probe: TAuthProbe): Promise<{ result: TProbeResult; message?: string }> => {
  try {
    await probe();
    return { result: 'allowed' };
  } catch (error) {
    const code = grpcCodeOf(error);
    if (code === GRPC_PERMISSION_DENIED || code === GRPC_UNAUTHENTICATED) return { result: 'denied' };
    return { result: 'unreachable', message: error instanceof Error ? error.message : String(error) };
  }
};

/**
 * Startup self-check of `per-project` mode (ADR 0050 (private)): the frontend must refuse a request
 * with no token and one with a token it can't verify. Temporal may come up after the backend, so an
 * unreachable server is retried until `timeoutMs`; only a *positive* finding that a probe was allowed
 * is `not-enforced`. The caller decides what to do (the backend refuses to start on `not-enforced`).
 */
export const checkTemporalAuthorizationEnforced = async (
  probes: IAuthSelfCheckProbes,
  options: IAuthSelfCheckOptions,
): Promise<TAuthSelfCheckOutcome> => {
  const deadline = options.now() + options.timeoutMs;
  let lastMessage = 'no attempt made';
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- sequential retries by design.
    const anonymous = await runProbe(probes.anonymous);
    // oxlint-disable-next-line no-await-in-loop -- sequential retries by design.
    const foreign = anonymous.result === 'unreachable' ? anonymous : await runProbe(probes.foreignToken);
    const results = { anonymous, foreignToken: foreign };
    const failed = Object.entries(results)
      .filter(([, outcome]) => outcome.result === 'allowed')
      .map(([name]) => name);
    if (failed.length > 0) return { status: 'not-enforced', failed };
    if (anonymous.result === 'denied' && foreign.result === 'denied') return { status: 'enforced' };

    lastMessage = (anonymous.result === 'unreachable' ? anonymous.message : foreign.message) ?? 'unreachable';
    options.warn?.(`Temporal not reachable yet for the authorization self-check: ${lastMessage}`);
    if (options.now() + options.retryDelayMs >= deadline) return { status: 'unreachable', message: lastMessage };
    // oxlint-disable-next-line no-await-in-loop -- sequential retries by design.
    await options.sleep(options.retryDelayMs);
  }
};

import { NativeConnection, type NativeConnectionOptions } from '@temporalio/worker';
import type { IRunnerConfig } from './runner-config.js';
import { fetchTemporalToken, TemporalTokenRefresher, type ITemporalToken } from './temporal-token-refresher.js';

const INITIAL_TOKEN_ATTEMPTS = 6;
const INITIAL_TOKEN_RETRY_DELAY_MS = 2000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** The slice of `NativeConnection` this module drives. */
export interface IRunnerTemporalConnection {
  setApiKey(apiKey: string): Promise<void>;
  close(): Promise<void>;
}

export interface IRunnerTemporalConnectionDeps<TConnection extends IRunnerTemporalConnection> {
  readonly connect: (options: NativeConnectionOptions) => Promise<TConnection>;
  readonly fetchToken: (tokenUrl: string, internalProjectToken: string) => Promise<ITemporalToken>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly onFatal: (error: Error) => void;
  readonly log: (message: string) => void;
}

const defaultDeps: IRunnerTemporalConnectionDeps<NativeConnection> = {
  connect: (options) => NativeConnection.connect(options),
  fetchToken: (tokenUrl, internalProjectToken) => fetchTemporalToken(tokenUrl, internalProjectToken),
  sleep,
  // A Worker whose token lapsed degrades silently (nothing new executes, the process lives on), so
  // end the process and let the Deployment restart the pod with a fresh token.
  onFatal: (error) => {
    // oxlint-disable-next-line no-console
    console.error('Workflow runner cannot keep its Temporal token fresh, exiting:', error);
    // oxlint-disable-next-line unicorn/no-process-exit -- ending the process is the point: the Deployment restarts the pod.
    process.exit(1);
  },
  // oxlint-disable-next-line no-console
  log: (message) => console.log(message),
};

export interface IRunnerTemporalHandle<TConnection extends IRunnerTemporalConnection> {
  readonly connection: TConnection;
  /** Stops the token refresh timer and closes the connection. */
  close(): Promise<void>;
}

/** `backend` may be restarting or the pod may have won the race against it — a few spaced retries before giving up. */
const fetchInitialToken = async <TConnection extends IRunnerTemporalConnection>(
  config: IRunnerConfig,
  tokenUrl: string,
  deps: IRunnerTemporalConnectionDeps<TConnection>,
): Promise<ITemporalToken> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- sequential retries by design.
      return await deps.fetchToken(tokenUrl, config.internalProjectToken);
    } catch (error) {
      if (attempt >= INITIAL_TOKEN_ATTEMPTS) throw error;
      deps.log(
        `Temporal token fetch failed (attempt ${attempt}/${INITIAL_TOKEN_ATTEMPTS}), retrying: ${error instanceof Error ? error.message : String(error)}`,
      );
      // oxlint-disable-next-line no-await-in-loop -- sequential retries by design.
      await deps.sleep(INITIAL_TOKEN_RETRY_DELAY_MS);
    }
  }
};

/**
 * Opens the runner's Temporal connection (ADR 0057 (private)). With `TEMPORAL_TOKEN_URL` set
 * (`per-project` isolation) it fetches a JWT that only grants access to this project's namespace,
 * connects with it — `tls` pinned explicitly, since the SDK turns TLS on by default as soon as an
 * `apiKey` is present, which would break against a plaintext in-cluster frontend — and keeps it fresh
 * (`TemporalTokenRefresher`). Without it, the pre-isolation tokenless connection.
 */
export const connectRunnerToTemporal = async <TConnection extends IRunnerTemporalConnection = NativeConnection>(
  config: IRunnerConfig,
  deps: IRunnerTemporalConnectionDeps<TConnection> = defaultDeps as unknown as IRunnerTemporalConnectionDeps<TConnection>,
): Promise<IRunnerTemporalHandle<TConnection> | null> => {
  if (!config.temporalAddress) return null;

  const initial = config.temporalTokenUrl ? await fetchInitialToken(config, config.temporalTokenUrl, deps) : null;
  const connection = await deps.connect({
    address: config.temporalAddress,
    ...(initial ? { apiKey: initial.token, tls: config.temporalTls === true } : {}),
    ...(!initial && config.temporalTls === true ? { tls: true } : {}),
  });

  const { temporalTokenUrl } = config;
  let refresher: TemporalTokenRefresher | null = null;
  if (initial && temporalTokenUrl) {
    refresher = new TemporalTokenRefresher({
      initial,
      fetchToken: () => deps.fetchToken(temporalTokenUrl, config.internalProjectToken),
      applyToken: (token) => connection.setApiKey(token),
      onFatal: deps.onFatal,
      log: deps.log,
    });
    refresher.start();
  }

  return {
    connection,
    close: async () => {
      refresher?.stop();
      await connection.close();
    },
  };
};

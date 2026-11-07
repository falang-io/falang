/**
 * Optional external services of the local mode (ADR 0072, private): mailpit, the egress proxy, media, user test
 * databases, ActivePieces. Each one is an `ILocalService` registered in `./index.ts`; `startLocalMode({ services })` /
 * the CLI's `--with <list>` start them before the backend and stop them with it.
 *
 * A service file imports from `./types.js` and `./supervisor.js` only (never `./index.js`, which imports the services).
 */

export const LOCAL_SERVICE_NAMES = [
  'mailpit',
  'egress-proxy',
  'media',
  'postgres-user-db',
  'mysql-user-db',
  'activepieces',
] as const;

export type TLocalServiceName = (typeof LOCAL_SERVICE_NAMES)[number];

export const isLocalServiceName = (value: string): value is TLocalServiceName =>
  (LOCAL_SERVICE_NAMES as readonly string[]).includes(value);

/**
 * What a started service lets the e2e suites run — the names of `FALANG_E2E_MISSING` (see
 * `@falang/workflow-backend`'s `test-utils/workflow-e2e-capabilities.ts` and `@falang/workflow-e2e-tests`'
 * `tests/e2e-capabilities.ts`). `npm run test-e2e:fast` removes every capability a started service reports.
 */
export type TLocalServiceCapability =
  | 'activepieces'
  | 'media'
  | 'mail'
  | 'postgres-user-db'
  | 'mysql-user-db'
  | 'egress-proxy';

export interface ILocalServiceContext {
  readonly name: TLocalServiceName;
  /** `<dataDir>/services/<name>`, created before `start` is called. */
  readonly dataDir: string;
  /** The local mode's data directory (contains `bin/`, `secrets.json`, …). */
  readonly rootDataDir: string;
  /** The local mode's log sink, unprefixed: write `[<name>] …` yourself (the supervisor prefixes child output). */
  readonly log: (line: string) => void;
  /** A free TCP port on `host` (default `127.0.0.1`). */
  readonly findFreePort: (host?: string) => Promise<number>;
  /** The backend's public URL, e.g. `http://localhost:4000` (OAuth callbacks, links in mails). */
  readonly publicUrl: string;
  /** The backend's internal URL (`/internal/*`, loopback) — for services that call back into the backend. */
  readonly internalUrl: string;
  /** True for e2e runs (`--test-mode`): e.g. ActivePieces' `NODE_ENV=test` mock pieces. */
  readonly testMode: boolean;
  /**
   * A snapshot of `process.env` without the platform secrets (`JWT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, …): the
   * base environment for a service's child process.
   */
  readonly childEnv: Readonly<NodeJS.ProcessEnv>;
  /**
   * A named secret persisted in `<dataDir>/secrets.json` (created as 32 random bytes in hex on first use, then the
   * same value on every start). Key: `[A-Z][A-Z0-9_]*`, e.g. `ACTIVEPIECES_SERVICE_SECRET`.
   */
  readonly getSecret: (key: string) => Promise<string>;
}

/** What a running service hands back to the local mode. Every field but `stop` is optional. */
export interface ILocalServiceHandle {
  /**
   * Set in the backend's `process.env` before it starts, as defaults (`??=`: a value the user exported wins). These
   * also reach runner processes (they inherit the backend's environment), so put secrets in `backendSecretEnv`.
   */
  readonly backendEnv?: Readonly<Record<string, string>>;
  /** Like `backendEnv`, but never passed to runner processes (tenant code runs there). */
  readonly backendSecretEnv?: Readonly<Record<string, string>>;
  /** Variables the e2e test process needs (e.g. `MAILPIT_URL`); written to the status file, merged by `test-e2e:fast`. */
  readonly testEnv?: Readonly<Record<string, string>>;
  /** `FALANG_E2E_MISSING` names this service provides. */
  readonly capabilities?: readonly TLocalServiceCapability[];
  /** Stops the service; called once, after the backend and the runners have stopped (or on a failed start). */
  stop(): Promise<void>;
}

export interface ILocalService {
  readonly name: TLocalServiceName;
  /** Starts the service and resolves once it is ready to serve; throws (having cleaned up) if it cannot. */
  start(ctx: ILocalServiceContext): Promise<ILocalServiceHandle>;
}

/** Per-service entry of the status file's `services` map. */
export interface ILocalServiceStatus {
  readonly testEnv: Readonly<Record<string, string>>;
  readonly capabilities: readonly TLocalServiceCapability[];
}

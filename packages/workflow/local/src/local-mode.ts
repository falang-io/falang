// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __filename is the correct tool here.
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startApp } from '@falang/workflow-backend';
import { createPgliteDatabaseOptions, UuidOsspExtensionMigration } from './db/queued-pglite-driver.js';
import { DiskFileStorage } from './files/disk-file-storage.js';
import { LocalModeModule } from './local-mode.module.js';
import { createProcessDeploymentsClient } from './runner/process-deployments-client.js';
import { loadOrCreateSecrets } from './secrets.js';
import { openInBrowser } from './open-in-browser.js';
import { createClientMiddleware } from './serve-client.js';
import { writeStatusFile, type ILocalStatus } from './status-file.js';
import { getLocalService, startLocalServices, tsxEntryCommand } from './services/index.js';
import type { ILocalServiceStatus, TLocalServiceName } from './services/index.js';
import { downloadTemporalCli, findFreePort, OnDemandTemporalServer, resolveTemporalCli } from './temporal/index.js';
import type { IProcessDeploymentsClient } from './runner/process-deployments-client.js';

export type { ILocalStatus } from './status-file.js';
export { openInBrowser } from './open-in-browser.js';

const requireFromHere = createRequire(__filename);

export interface IStartLocalModeOptions {
  /** Everything persistent lives here: `db/`, `files/`, `temporal/`, `bin/`, `secrets.json`. */
  readonly dataDir: string;
  /** Public port; default `PORT` env, then 4000. `0` picks a free one. */
  readonly port?: number;
  /** Internal API port (runner pods only); default `INTERNAL_PORT` env, then 3001. `0` picks a free one. */
  readonly internalPort?: number;
  /** Built client directory to serve from the backend's port; `null` = serve none. */
  readonly clientDir?: string | null;
  /** Open the default browser on start. The CLI passes `true`. Default false. */
  readonly openBrowser?: boolean;
  /** Start the Temporal Web UI with the server (default true); false = headless. */
  readonly temporalUi?: boolean;
  /**
   * One user signed in without a password (`SINGLE_USER_MODE=true`): the desktop app. The client then hides the
   * default-password warning, other users, the support chat and password changes. Default false (the CLI keeps the
   * normal `admin` sign-in).
   */
  readonly singleUser?: boolean;
  /**
   * Write `{ url, internalUrl, temporalAddress, temporalUiUrl, pid, firstRun, controlToken }` here (atomically, mode 0600)
   * once everything is up, remove it on stop, and enable the `/internal/local/*` control routes protected by that token.
   */
  readonly statusFile?: string;
  /** Control-route token; default a fresh random one when `statusFile` is set, otherwise the routes are off. */
  readonly controlToken?: string;
  /** Called after `POST /internal/local/shutdown` was accepted (the CLI stops and exits). */
  readonly onShutdownRequested?: () => void;
  readonly log?: (line: string) => void;
  /** Called when the Temporal child dies on its own (after it was started on demand). */
  readonly onTemporalExit?: (error: Error) => void;
  /**
   * Optional services to start before the backend (`--with`): see `src/services/`. Their `backendEnv` is applied as
   * defaults, they are stopped after the backend and the runners, and listed in the status file. Default none.
   */
  readonly services?: readonly TLocalServiceName[];
  /** An e2e/test run (`--test-mode`): services may enable test-only behaviour (e.g. mock pieces). Default false. */
  readonly testMode?: boolean;
}

export interface ILocalMode {
  readonly url: string;
  readonly internalUrl: string;
  readonly temporalAddress: string;
  readonly temporalUiUrl: string | null;
  /** True when `secrets.json` was created by this start, i.e. the first run on this data directory. */
  readonly firstRun: boolean;
  /** The per-run control token, or `null` when the control routes are off. */
  readonly controlToken: string | null;
  /** Same as the status file's `services`. */
  readonly services: Readonly<Partial<Record<TLocalServiceName, ILocalServiceStatus>>>;
  stop(): Promise<void>;
}

/** Sets `process.env[key]` only when the user has not set it — so every default below is overridable. */
const setDefault = (key: string, value: string): void => {
  process.env[key] ??= value;
};

const SECRET_ENV_KEYS = [
  'JWT_SECRET',
  'CREDENTIALS_ENCRYPTION_KEY',
  'PROJECT_TOKEN_SECRET',
  'WEBHOOK_SECRET_KEY',
  'DB_PASSWORD',
] as const;

const resolvePort = (explicit: number | undefined, envName: string, fallback: number): Promise<number> => {
  if (explicit === 0) return findFreePort();
  if (typeof explicit === 'number') return Promise.resolve(explicit);
  const fromEnv = Number(process.env[envName]);
  return Promise.resolve(Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : fallback);
};

/** Runner processes connect to Temporal right away, so the on-demand server is started before the first one. */
const startTemporalBeforeRunners = (
  client: IProcessDeploymentsClient,
  temporal: OnDemandTemporalServer,
): IProcessDeploymentsClient => ({
  ...client,
  apply: async (namespace, deployment) => {
    await temporal.ensureStarted();
    await client.apply(namespace, deployment);
  },
});

/** Default data directory of the CLI. */
export const defaultDataDir = (): string =>
  process.env.FALANG_LOCAL_DATA_DIR ?? path.join(os.homedir(), '.falang-flow');

/**
 * Starts the whole workflow product in this one process: PGlite database, disk file storage, runners as child processes
 * (ADR 0072, private). The `temporal` CLI dev server starts only when something needs it — the first runner process or a
 * read of runs it already stored (`OnDemandTemporalServer`); its ports are picked here so the addresses are known.
 * Environment defaults are applied with `??=`, so any of them can be overridden from the shell.
 */
export const startLocalMode = async (options: IStartLocalModeOptions): Promise<ILocalMode> => {
  // oxlint-disable-next-line no-console -- default sink of the CLI.
  const log = options.log ?? ((line: string) => console.log(line));
  const dataDir = path.resolve(options.dataDir);
  await Promise.all(
    ['db', 'files', 'temporal', 'bin'].map((dir) => mkdir(path.join(dataDir, dir), { recursive: true })),
  );

  const { secrets, created } = await loadOrCreateSecrets(dataDir);
  const port = await resolvePort(options.port, 'PORT', 4000);
  const internalPort = await resolvePort(options.internalPort, 'INTERNAL_PORT', 3001);
  const publicUrl = `http://localhost:${port}`;
  const internalUrl = `http://127.0.0.1:${internalPort}`;

  // The CLI is looked up (and, if missing, downloaded) in the background right away; the server itself starts only
  // when something needs it (`OnDemandTemporalServer`). A failed lookup is retried by the next start attempt.
  let cliLookup: Promise<string> | null = null;
  const resolveCli = (): Promise<string> => {
    cliLookup ??= (async () => {
      const found = await resolveTemporalCli({ env: process.env, dataDir });
      if (found) return found;
      log('[local] temporal CLI not found, downloading it');
      return downloadTemporalCli({ dataDir });
    })();
    const current = cliLookup;
    current.catch(() => {
      if (cliLookup === current) cliLookup = null;
    });
    return current;
  };
  resolveCli().catch((error: unknown) =>
    log(`[local] temporal CLI lookup failed (retried on start): ${String(error)}`),
  );
  let stopping: Promise<void> | null = null;
  const temporalIp = '127.0.0.1';
  const temporalPort = await findFreePort(temporalIp);
  let temporalUiPort: number | null = null;
  // Picked now, bound only when the server starts: two lookups in a row may hand out the same free port.
  while (options.temporalUi !== false && (temporalUiPort === null || temporalUiPort === temporalPort)) {
    // oxlint-disable-next-line no-await-in-loop -- retried only on a collision
    temporalUiPort = await findFreePort(temporalIp);
  }
  const temporal = new OnDemandTemporalServer({
    resolveCli,
    dbFile: path.join(dataDir, 'temporal', 'temporal.db'),
    ip: temporalIp,
    port: temporalPort,
    uiPort: temporalUiPort,
    log,
    onUnexpectedExit: (error) => {
      if (!stopping) options.onTemporalExit?.(error);
    },
  });

  Object.entries(secrets).forEach(([key, value]) => setDefault(key, value));
  // PGlite has no authentication; the validator only wants a long enough value.
  setDefault('DB_PASSWORD', 'local-mode-no-database-password-needed');
  const env: Record<string, string> = {
    NODE_ENV: 'development',
    SEED_DEFAULT_ADMIN: 'true',
    SIGNUP_MODE: 'off',
    CAPTCHA_PROVIDER: 'none',
    EGRESS_ALLOW_PRIVATE: 'true',
    RATE_LIMIT_ENABLED: 'false',
    TEMPORAL_ADDRESS: temporal.address,
    TEMPORAL_TENANT_ISOLATION: 'shared',
    BACKEND_PUBLIC_URL: publicUrl,
    CLIENT_PUBLIC_URL: publicUrl,
    BACKEND_INTERNAL_URL: internalUrl,
    CORS_ORIGINS: publicUrl,
    ...(options.singleUser ? { SINGLE_USER_MODE: 'true' } : {}),
  };
  Object.entries(env).forEach(([key, value]) => setDefault(key, value));

  // Optional services: their `backendEnv` must be in `process.env` before the backend reads its config. Started after
  // the local defaults above (which therefore win on a clash) and stopped again if the backend fails to start.
  const withoutSecrets = (source: NodeJS.ProcessEnv, extra: readonly string[] = []): NodeJS.ProcessEnv =>
    Object.fromEntries(
      Object.entries(source).filter(
        ([key]) => !(SECRET_ENV_KEYS as readonly string[]).includes(key) && !extra.includes(key),
      ),
    );
  const services = await startLocalServices(options.services ?? [], {
    dataDir,
    log,
    publicUrl,
    internalUrl,
    testMode: options.testMode ?? false,
    childEnv: withoutSecrets(process.env),
    resolve: getLocalService,
  });
  Object.entries(services.backendEnv).forEach(([key, value]) => setDefault(key, value));
  Object.entries(services.backendSecretEnv).forEach(([key, value]) => setDefault(key, value));

  // Tenant code runs in the runner: it gets no platform secrets.
  const runnerEnv = withoutSecrets(process.env, Object.keys(services.backendSecretEnv));
  // The runner resolves the activities module's imports (`@temporalio/activity`, vendor packages) from this directory.
  runnerEnv.RUNNER_MODULE_ROOT = path.dirname(requireFromHere.resolve('@falang/workflow-runner/package.json'));
  // `--import tsx` loads TypeScript in the runner's own process; the `tsx` CLI would add a second Node process
  // (~60 MB) per runner.
  const runnerCommand = tsxEntryCommand(requireFromHere.resolve('@falang/workflow-runner/src/main.ts'));
  const deploymentsClient = startTemporalBeforeRunners(
    createProcessDeploymentsClient({
      command: { file: runnerCommand.command, args: runnerCommand.args },
      baseEnv: runnerEnv,
      log,
    }),
    temporal,
  );
  const fileStorage = new DiskFileStorage(path.join(dataDir, 'files'));
  const controlToken = options.controlToken ?? (options.statusFile ? randomBytes(32).toString('hex') : null);
  const statusFile = options.statusFile ? path.resolve(options.statusFile) : null;

  const app = await startApp({
    port,
    internalPort,
    database: createPgliteDatabaseOptions({ dataDir: path.join(dataDir, 'db') }),
    extraMigrations: [UuidOsspExtensionMigration],
    extraModules: [
      LocalModeModule.forRoot({
        deploymentsClient,
        fileStorage,
        temporalServer: temporal,
        control: { token: controlToken, onShutdownRequested: () => options.onShutdownRequested?.() },
      }),
    ],
    beforeInit: (nest) => {
      if (options.clientDir) for (const handler of createClientMiddleware(options.clientDir)) nest.use(handler);
    },
  }).catch(async (error: unknown) => {
    await deploymentsClient.stopAll();
    await services.stop();
    await temporal.stop();
    throw error;
  });

  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      if (statusFile) await rm(statusFile, { force: true });
      await app.close().catch((error: unknown) => log(`[local] app.close failed: ${String(error)}`));
      await deploymentsClient.stopAll();
      await services.stop();
      await temporal.stop();
    })();
    return stopping;
  };

  if (statusFile && controlToken) {
    const status: ILocalStatus = {
      url: publicUrl,
      internalUrl,
      temporalAddress: temporal.address,
      temporalUiUrl: temporal.uiUrl,
      pid: process.pid,
      firstRun: created,
      controlToken,
      services: services.status,
    };
    await writeStatusFile(statusFile, status);
  }
  if (options.openBrowser) openInBrowser(publicUrl);
  return {
    url: publicUrl,
    internalUrl,
    temporalAddress: temporal.address,
    temporalUiUrl: temporal.uiUrl,
    firstRun: created,
    controlToken,
    services: services.status,
    stop,
  };
};

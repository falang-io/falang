// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __filename is the correct tool here.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startApp } from '@falang/workflow-backend';
import { createPgliteDatabaseOptions, UuidOsspExtensionMigration } from './db/queued-pglite-driver.js';
import { DiskFileStorage } from './files/disk-file-storage.js';
import { LocalModeModule } from './local-mode.module.js';
import { createProcessDeploymentsClient } from './runner/process-deployments-client.js';
import { loadOrCreateSecrets } from './secrets.js';
import { createClientMiddleware } from './serve-client.js';
import {
  downloadTemporalCli,
  findFreePort,
  resolveTemporalCli,
  startTemporalDevServer,
  type ITemporalDevServer,
} from './temporal/index.js';

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
  /** Start the Temporal Web UI (default true); false = headless. */
  readonly temporalUi?: boolean;
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
  /** Called when the Temporal child dies on its own (after the app was started). */
  readonly onTemporalExit?: (error: Error) => void;
}

export interface ILocalStatus {
  readonly url: string;
  readonly internalUrl: string;
  readonly temporalAddress: string;
  readonly temporalUiUrl: string | null;
  readonly pid: number;
  readonly firstRun: boolean;
  readonly controlToken: string;
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

/** Default data directory of the CLI. */
export const defaultDataDir = (): string =>
  process.env.FALANG_LOCAL_DATA_DIR ?? path.join(os.homedir(), '.falang-flow');

export const openInBrowser = (url: string): void => {
  let command = { file: 'xdg-open', args: [url] };
  if (process.platform === 'darwin') command = { file: 'open', args: [url] };
  if (process.platform === 'win32') command = { file: 'cmd', args: ['/c', 'start', '', url] };
  try {
    const child = spawn(command.file, command.args, { detached: true, stdio: 'ignore' });
    child.on('error', () => null);
    child.unref();
  } catch {
    // no browser available: the URL is printed anyway
  }
};

/**
 * Starts the whole workflow product in this one process plus the `temporal` CLI dev server: PGlite database, disk file
 * storage, runners as child processes (ADR 0072, private). Environment defaults are applied with `??=`, so any of them
 * can be overridden from the shell.
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

  let cliPath = await resolveTemporalCli({ env: process.env, dataDir });
  if (!cliPath) {
    log('[local] temporal CLI not found, downloading it');
    cliPath = await downloadTemporalCli({ dataDir });
  }
  const temporal: ITemporalDevServer = await startTemporalDevServer({
    cliPath,
    dbFile: path.join(dataDir, 'temporal', 'temporal.db'),
    headless: options.temporalUi === false,
    log,
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
  };
  Object.entries(env).forEach(([key, value]) => setDefault(key, value));

  // Tenant code runs in the runner: it gets no platform secrets.
  const runnerEnv: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !(SECRET_ENV_KEYS as readonly string[]).includes(key)),
  );
  // The runner resolves the activities module's imports (`@temporalio/activity`, vendor packages) from this directory.
  runnerEnv.RUNNER_MODULE_ROOT = path.dirname(requireFromHere.resolve('@falang/workflow-runner/package.json'));
  const tsxCli = requireFromHere.resolve('tsx/cli');
  const runnerMain = requireFromHere.resolve('@falang/workflow-runner/src/main.ts');
  const deploymentsClient = createProcessDeploymentsClient({
    command: { file: process.execPath, args: [tsxCli, runnerMain] },
    baseEnv: runnerEnv,
    log,
  });
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
        control: { token: controlToken, onShutdownRequested: () => options.onShutdownRequested?.() },
      }),
    ],
    beforeInit: (nest) => {
      if (options.clientDir) for (const handler of createClientMiddleware(options.clientDir)) nest.use(handler);
    },
  }).catch(async (error: unknown) => {
    await deploymentsClient.stopAll();
    await temporal.stop();
    throw error;
  });

  let stopping: Promise<void> | null = null;
  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      if (statusFile) await rm(statusFile, { force: true });
      await app.close().catch((error: unknown) => log(`[local] app.close failed: ${String(error)}`));
      await deploymentsClient.stopAll();
      await temporal.stop();
    })();
    return stopping;
  };

  temporal.exited.then(
    ({ code, signal }) => {
      if (stopping) return;
      options.onTemporalExit?.(
        new Error(`The Temporal dev server exited unexpectedly (code ${code}, signal ${signal})`),
      );
    },
    () => null,
  );

  if (statusFile && controlToken) {
    const status: ILocalStatus = {
      url: publicUrl,
      internalUrl,
      temporalAddress: temporal.address,
      temporalUiUrl: temporal.uiUrl,
      pid: process.pid,
      firstRun: created,
      controlToken,
    };
    await mkdir(path.dirname(statusFile), { recursive: true });
    const tmpFile = `${statusFile}.${process.pid}.tmp`;
    await writeFile(tmpFile, JSON.stringify(status), { mode: 0o600 });
    await rename(tmpFile, statusFile);
  }
  if (options.openBrowser) openInBrowser(publicUrl);
  return {
    url: publicUrl,
    internalUrl,
    temporalAddress: temporal.address,
    temporalUiUrl: temporal.uiUrl,
    firstRun: created,
    controlToken,
    stop,
  };
};

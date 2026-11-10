// oxlint-disable no-console, unicorn/no-process-exit, unicorn/prefer-module -- a CLI script; this repository is CommonJS.
/**
 * Fast e2e run on the local mode (ADR 0072 (private)): no Docker, no kind. Starts `@falang/workflow-mocks` and
 * `@falang/workflow-local`'s CLI (PGlite, process runners, the `temporal` CLI dev server, disk file storage) as child
 * processes on free ports, then runs the workflow tier (`vitest.config.workflow-e2e.ts`) and the browser tier
 * (Playwright, one worker — several specs share app-wide settings) against them.
 *
 * Specs that need what the local mode does not have (ActivePieces, media, mail, user databases, the egress proxy,
 * per-project Temporal isolation) are skipped through `FALANG_E2E_MISSING` (see `workflow-e2e-capabilities.ts`).
 * Not a replacement for `npm run test-e2e`: k8s runner pods, real Postgres, S3 and tenant isolation are only
 * covered there.
 *
 * Run: `npm run test-e2e:fast [-- --tier workflow|browser|all] [--with <services>] [--reuse-client] [--keep]
 * [-- <filters>]` (filters go to the one selected tier and need `--tier workflow` or `--tier browser`). `--with a,b`
 * starts optional local services (`@falang/workflow-local`'s `src/services/`, default `DEFAULT_SERVICES`; `--with ''`
 * none); each service's `testEnv` reaches the tests and its capabilities are removed from `FALANG_E2E_MISSING`.
 * Needs a `temporal` binary on PATH or downloads one (see `@falang/workflow-local`).
 */
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { freePort, isUp, run, sleep, startService, stopService } from './test-e2e-fast-lib.js';

const ROOT = path.resolve(__dirname, '..');
const CLIENT_PACKAGE_DIR = path.join(ROOT, 'packages', 'workflow', 'client');
const CLIENT_OUT_DIR = path.join(ROOT, 'node_modules', '.cache', 'falang-e2e-fast', 'client');
const E2E_TESTS_DIR = path.join(ROOT, 'packages', 'workflow', 'e2e-tests');

/** What the local mode lacks compared with the kind stack — the matching specs are skipped. */
const MISSING_CAPABILITIES = [
  'activepieces',
  'media',
  'mail',
  'postgres-user-db',
  'mysql-user-db',
  'egress-proxy',
  'temporal-isolation',
];

/**
 * Optional local services started by default (`--with` overrides). Each started service removes the capabilities it
 * reports from the list above. One line per service.
 */
const DEFAULT_SERVICES: readonly string[] = [
  'activepieces',
  'mailpit',
  'egress-proxy',
  'media',
  'postgres-user-db',
  'mysql-user-db',
];

/** Same value as `docker-compose.workflow-e2e.yml`: the tables spec derives project tokens from it. */
const PROJECT_TOKEN_SECRET = 'e2e-project-token-secret-at-least-32-chars';

type TTier = 'workflow' | 'browser' | 'all';

interface IArgs {
  readonly tier: TTier;
  readonly reuseClient: boolean;
  readonly keep: boolean;
  readonly services: readonly string[];
  readonly filters: readonly string[];
}

interface ILocalStatusFile {
  readonly temporalAddress: string;
  readonly services?: Readonly<
    Record<string, { readonly testEnv?: Readonly<Record<string, string>>; readonly capabilities?: readonly string[] }>
  >;
}

const splitList = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const parseArgs = (argv: readonly string[]): IArgs => {
  let tier: TTier = 'all';
  let reuseClient = false;
  let keep = false;
  let services: readonly string[] = DEFAULT_SERVICES;
  const filters: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--tier') {
      const value = argv[index + 1];
      if (value !== 'workflow' && value !== 'browser' && value !== 'all') throw new Error(`Unknown tier: ${value}`);
      tier = value;
      index += 1;
    } else if (arg === '--with') {
      const value = argv[index + 1];
      if (typeof value !== 'string') throw new Error('--with needs a value (comma-separated services, or "")');
      services = splitList(value);
      index += 1;
    } else if (arg === '--reuse-client') reuseClient = true;
    else if (arg === '--keep') keep = true;
    else if (arg === '--') filters.push(...argv.slice(index + 1));
    else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else filters.push(arg);
    if (arg === '--') break;
  }
  if (filters.length > 0 && tier === 'all') throw new Error('Filters need --tier workflow or --tier browser');
  return { tier, reuseClient, keep, services, filters };
};

const buildClient = async (): Promise<void> => {
  console.log(`[e2e-fast] building the client into ${CLIENT_OUT_DIR}`);
  const code = await run('npx', ['vite', 'build', '--outDir', CLIENT_OUT_DIR, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: CLIENT_PACKAGE_DIR,
    // VITE_DOCS_URL: the same fake docs host as the kind stack (docs-links.spec.ts checks the links only).
    env: { ...process.env, VITE_BACKEND_URL: 'same-origin', VITE_DOCS_URL: 'https://docs.e2e.test' },
  });
  if (code !== 0) throw new Error(`client build failed (exit ${code})`);
};

const waitForStatusFile = async (file: string, local: ChildProcess, logFile: string): Promise<ILocalStatusFile> => {
  const deadline = Date.now() + 180_000;
  while (!existsSync(file)) {
    if (local.exitCode !== null) throw new Error(`local mode exited with code ${local.exitCode}, see ${logFile}`);
    if (Date.now() > deadline) throw new Error(`local mode did not start within 180 s, see ${logFile}`);
    // oxlint-disable-next-line no-await-in-loop -- polling
    await sleep(500);
  }
  return JSON.parse(await readFile(file, 'utf8')) as ILocalStatusFile;
};

const main = async (): Promise<number> => {
  const args = parseArgs(process.argv.slice(2));
  const runBrowser = args.tier !== 'workflow';
  const runWorkflow = args.tier !== 'browser';
  const startedAt = Date.now();

  if (runBrowser && !(args.reuseClient && existsSync(path.join(CLIENT_OUT_DIR, 'index.html')))) await buildClient();

  const runDir = await mkdtemp(path.join(os.tmpdir(), 'falang-e2e-fast-'));
  const [backendPort, internalPort, mocksPort] = [await freePort(), await freePort(), await freePort()];
  const backendUrl = `http://localhost:${backendPort}`;
  const internalUrl = `http://127.0.0.1:${internalPort}`;
  const mocksUrl = `http://127.0.0.1:${mocksPort}`;
  const mocksLog = path.join(runDir, 'mocks.log');
  const localLog = path.join(runDir, 'local.log');
  const statusFile = path.join(runDir, 'status.json');

  let mocks: ChildProcess | null = null;
  let local: ChildProcess | null = null;
  let failed = false;
  const shutdown = async (): Promise<void> => {
    // SIGINT lets the local-mode CLI stop its runners and Temporal before it exits.
    await stopService(local, 'SIGINT', 30_000);
    await stopService(mocks, 'SIGTERM', 5000);
  };
  const onSignal = (): void => {
    shutdown().then(
      () => process.exit(130),
      () => process.exit(130),
    );
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    mocks = startService(
      'packages/workflow/mocks/src/main.ts',
      [],
      { ...process.env, PORT: String(mocksPort) },
      mocksLog,
      ROOT,
    );
    local = startService(
      'packages/workflow/local/src/main.ts',
      [
        '--data-dir',
        path.join(runDir, 'data'),
        '--port',
        String(backendPort),
        '--internal-port',
        String(internalPort),
        '--status-file',
        statusFile,
        '--no-browser',
        '--no-ui',
        '--test-mode',
        ...(args.services.length > 0 ? ['--with', args.services.join(',')] : []),
        ...(runBrowser ? ['--client-dir', CLIENT_OUT_DIR] : ['--skip-client']),
      ],
      {
        ...process.env,
        PROJECT_TOKEN_SECRET,
        // The same product settings `docker-compose.workflow-e2e.yml` gives its backend.
        SIGNUP_MODE: 'open',
        SELF_SERVICE_SIGNUP: 'true',
        ENABLE_SQLITE_INTEGRATION: 'true',
        MAX_PROJECTS: '100000',
        MAX_DEV_PODS: '1000',
        MAX_SCHEDULES: '1000',
        MAX_STORED_VERSIONS: '1000',
        SCHEDULE_MIN_INTERVAL_SECONDS: '1',
        TELEGRAM_API_BASE_URL: `${mocksUrl}/telegram`,
        // Runners reach the Telegram mock by another name than the backend, so the egress-proxy spec can tell them apart.
        RUNNER_TELEGRAM_API_BASE_URL: `http://localhost:${mocksPort}/telegram`,
        // Binaries the optional services download (mailpit) are kept between runs.
        FALANG_LOCAL_BIN_DIR: path.join(ROOT, 'node_modules', '.cache', 'falang-e2e-fast', 'bin'),
        MAX_API_BASE_URL: `${mocksUrl}/max`,
        VK_API_BASE_URL: `${mocksUrl}/vk`,
      },
      localLog,
      ROOT,
    );
    const status = await waitForStatusFile(statusFile, local, localLog);
    const mocksDeadline = Date.now() + 30_000;
    // oxlint-disable-next-line no-await-in-loop -- polling
    while (!(await isUp(mocksUrl))) {
      if (Date.now() > mocksDeadline) throw new Error(`mocks did not start, see ${mocksLog}`);
      // oxlint-disable-next-line no-await-in-loop -- polling
      await sleep(300);
    }
    console.log(
      `[e2e-fast] stack up in ${Math.round((Date.now() - startedAt) / 1000)} s — ${backendUrl}, logs in ${runDir}`,
    );

    const serviceStatuses = Object.values(status.services ?? {});
    const provided = new Set(serviceStatuses.flatMap((service) => service.capabilities ?? []));
    const missing = MISSING_CAPABILITIES.filter((capability) => !provided.has(capability));
    if (args.services.length > 0) {
      console.log(`[e2e-fast] services: ${args.services.join(', ')}; missing capabilities: ${missing.join(', ')}`);
    }
    const testEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...Object.assign({}, ...serviceStatuses.map((service) => service.testEnv ?? {})),
      FALANG_E2E_MISSING: missing.join(','),
      BACKEND_URL: backendUrl,
      BACKEND_INTERNAL_URL: internalUrl,
      TEMPORAL_ADDRESS: status.temporalAddress,
      MOCKS_URL: mocksUrl,
      // Runners are processes on this machine: what the test process reaches, they reach too.
      RUNNER_MOCKS_URL: mocksUrl,
      KIND_GATEWAY_IP: '127.0.0.1',
      // See RUNNER_TELEGRAM_API_BASE_URL above: the two Telegram targets the egress proxy sees.
      E2E_PROXY_BACKEND_TARGET: `127.0.0.1:${mocksPort}`,
      E2E_PROXY_POD_TARGET: `localhost:${mocksPort}`,
      PROJECT_TOKEN_SECRET,
    };
    const results: string[] = [];
    if (runWorkflow) {
      const tierStart = Date.now();
      const code = await run('npx', ['vitest', 'run', '-c', 'vitest.config.workflow-e2e.ts', ...args.filters], {
        cwd: ROOT,
        env: testEnv,
      });
      failed ||= code !== 0;
      results.push(`workflow tier: exit ${code}, ${Math.round((Date.now() - tierStart) / 1000)} s`);
    }
    if (runBrowser) {
      const tierStart = Date.now();
      const code = await run('npx', ['playwright', 'test', '--workers=1', ...args.filters], {
        cwd: E2E_TESTS_DIR,
        env: { ...testEnv, CLIENT_URL: backendUrl },
      });
      failed ||= code !== 0;
      results.push(`browser tier: exit ${code}, ${Math.round((Date.now() - tierStart) / 1000)} s`);
    }
    for (const line of results) console.log(`[e2e-fast] ${line}`);
  } catch (error) {
    failed = true;
    console.error(`[e2e-fast] ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await shutdown();
  }

  if (failed || args.keep) console.log(`[e2e-fast] kept ${runDir} (logs, data)`);
  else await rm(runDir, { recursive: true, force: true });
  console.log(`[e2e-fast] total ${Math.round((Date.now() - startedAt) / 1000)} s`);
  return failed ? 1 : 0;
};

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);

// oxlint-disable no-console, unicorn/no-process-exit, unicorn/prefer-module, no-undefined, no-void, unicorn/switch-case-braces -- this is the CLI: console and process.exit are its interface, the package is CommonJS (__dirname), and a fire-and-forget shutdown is intentional.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseLocalCliArgs } from './cli-args.js';
import { defaultDataDir, startLocalMode } from './local-mode.js';

/** `packages/workflow/local/src` -> the repository root. */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DEFAULT_CLIENT_DIR = path.join(REPO_ROOT, 'packages', 'workflow', 'client', 'dist');

const buildClient = (): Promise<void> =>
  new Promise((resolve, reject) => {
    console.log('[local] building the client (first run, ~1 minute)');
    const child = spawn(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'build', '-w', '@falang/workflow-client'],
      {
        cwd: REPO_ROOT,
        stdio: 'inherit',
        shell: false,
        env: { ...process.env, VITE_BACKEND_URL: 'same-origin' },
      },
    );
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`client build failed (exit ${code})`))));
  });

let stopLocal: (() => Promise<void>) | null = null;
const shutdown = (): void => {
  void (stopLocal ? stopLocal() : Promise.resolve()).finally(() => process.exit(0));
};

const main = async (): Promise<void> => {
  const args = parseLocalCliArgs(process.argv.slice(2), defaultDataDir());
  let clientDir: string | null = null;
  if (!args.skipClient) {
    clientDir = path.resolve(args.clientDir ?? DEFAULT_CLIENT_DIR);
    if (!existsSync(path.join(clientDir, 'index.html'))) {
      if (args.clientDir) throw new Error(`No built client in ${clientDir}`);
      await buildClient();
    }
  }
  const local = await startLocalMode({
    dataDir: args.dataDir,
    ...(args.port === undefined ? {} : { port: args.port }),
    ...(args.internalPort === undefined ? {} : { internalPort: args.internalPort }),
    clientDir,
    openBrowser: args.openBrowser,
    temporalUi: args.temporalUi,
    ...(args.statusFile === undefined ? {} : { statusFile: args.statusFile }),
    onShutdownRequested: () => shutdown(),
    onTemporalExit: (error) => {
      console.error(`[local] ${error.message}`);
      void local.stop().finally(() => process.exit(1));
    },
  });
  stopLocal = () => local.stop();
  console.log(`\nFalang Flow is running: ${local.url}`);
  if (local.temporalUiUrl) console.log(`Temporal UI: ${local.temporalUiUrl}`);
  console.log(`Data directory: ${path.resolve(args.dataDir)}`);
  console.log(
    local.firstRun
      ? 'Login: admin / admin (change it in Settings)'
      : 'Login: admin (default password: admin, unless you changed it)',
  );
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

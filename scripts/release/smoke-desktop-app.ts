/* oxlint-disable no-console -- a CI script: its console output is the report. */
/**
 * Smoke test for a **packaged** desktop app (the electron-builder `*-unpacked` / `.app` output), run
 * by `.github/workflows/desktop-release.yml` on each OS's own runner. It checks what only breaks in a
 * packaged build on a user's machine, never in dev:
 *
 *  1. the bundled worker (`export-worker` / `compile-worker`) runs under the app's own binary in
 *     Node mode and answers a job — the path that used to spawn `node` from `PATH`;
 *  2. the bundled MCP server starts the same way and answers `tools/list` over stdio, exactly as a
 *     project's `.mcp.json` makes a coding agent launch it;
 *  3. the app itself opens a window and renders without a page error.
 *
 * Usage: `npx tsx scripts/release/smoke-desktop-app.ts <sketch|arduino> [--screenshot <file.png>]`
 * from the repository root, after `electron-builder --dir` (or a full build) for that app.
 * On Linux CI it needs a display (`xvfb-run`). See ADR 0050 (private).
 */
import { promises as fs, readdirSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { _electron as electron } from 'playwright';
import { createProject } from '@falang/desktop-project-fs';
import { runInWorkerProcess } from '@falang/desktop-worker-process';

type TAppKind = 'sketch' | 'arduino';

interface IAppSpec {
  readonly appDir: string;
  readonly linuxExecutable: string;
  readonly worker: string;
  readonly workerJob: (tempDir: string) => unknown;
  readonly projectType: string;
}

const APPS: Record<TAppKind, IAppSpec> = {
  sketch: {
    appDir: 'packages/desktop/app-sketch',
    linuxExecutable: 'falang',
    worker: 'export-worker',
    // An empty code export: enough to load the whole bundled worker and get a result back.
    workerJob: (tempDir) => ({ kind: 'code', dir: tempDir, documents: [] }),
    projectType: 'text',
  },
  arduino: {
    appDir: 'packages/desktop/app-arduino',
    linuxExecutable: 'falang-arduino',
    worker: 'compile-worker',
    workerJob: () => ({ documents: [], drivers: [] }),
    projectType: 'arduino',
  },
};

interface IPackagedApp {
  readonly binary: string;
  readonly resources: string;
}

/** Finds the packaged binary and its `resources` dir in `<appDir>/dist`, per electron-builder's own output layout. */
const locatePackagedApp = (appDir: string, spec: IAppSpec): IPackagedApp => {
  const dist = path.join(appDir, 'dist');
  const entries = readdirSync(dist);
  if (process.platform === 'darwin') {
    const macDir = entries.find((entry) => entry === 'mac' || entry.startsWith('mac-'));
    if (!macDir) throw new Error(`no mac*/ directory in ${dist}`);
    const bundle = readdirSync(path.join(dist, macDir)).find((entry) => entry.endsWith('.app'));
    if (!bundle) throw new Error(`no .app in ${path.join(dist, macDir)}`);
    const contents = path.join(dist, macDir, bundle, 'Contents');
    const [executable] = readdirSync(path.join(contents, 'MacOS'));
    return { binary: path.join(contents, 'MacOS', executable), resources: path.join(contents, 'Resources') };
  }
  if (process.platform === 'win32') {
    const unpacked = path.join(dist, 'win-unpacked');
    const exe = readdirSync(unpacked).find((entry) => entry.endsWith('.exe'));
    if (!exe) throw new Error(`no .exe in ${unpacked}`);
    return { binary: path.join(unpacked, exe), resources: path.join(unpacked, 'resources') };
  }
  const unpacked = path.join(dist, 'linux-unpacked');
  return { binary: path.join(unpacked, spec.linuxExecutable), resources: path.join(unpacked, 'resources') };
};

/** The app's own binary in plain Node mode — the same command `electronNodeCommand` builds inside the app. */
const NODE_MODE_ENV = { ELECTRON_RUN_AS_NODE: '1' } as const;

const withTimeout = async <T>(label: string, ms: number, promise: Promise<T>): Promise<T> => {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: timed out after ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const checkWorker = async (app: IPackagedApp, spec: IAppSpec, tempDir: string): Promise<void> => {
  const script = path.join(app.resources, spec.worker, 'index.js');
  const handle = runInWorkerProcess<unknown, unknown, unknown>({
    command: { command: app.binary, args: [script], env: NODE_MODE_ENV },
    job: spec.workerJob(tempDir),
  });
  const result = await withTimeout('worker', 60_000, handle.result);
  console.log(`  worker answered: ${JSON.stringify(result).slice(0, 200)}`);
};

const checkMcpServer = async (app: IPackagedApp, spec: IAppSpec, tempDir: string): Promise<void> => {
  const projectDir = path.join(tempDir, 'project');
  await createProject(projectDir, { name: 'Smoke', type: spec.projectType });
  const args = [path.join(app.resources, 'mcp-server', 'index.js'), projectDir];
  if (spec.projectType === 'arduino') {
    args.push('--drivers-dir', path.join(app.resources, 'drivers'));
  }
  const transport = new StdioClientTransport({
    command: app.binary,
    args,
    env: { ...getDefaultEnvironment(), ...NODE_MODE_ENV },
    stderr: 'inherit',
  });
  const client = new Client({ name: 'falang-smoke', version: '1.0.0' });
  try {
    await withTimeout('mcp connect', 60_000, client.connect(transport));
    const { tools } = await withTimeout('mcp tools/list', 30_000, client.listTools());
    if (tools.length === 0) throw new Error('the MCP server listed no tools');
    const tree = await withTimeout(
      'mcp list_documents',
      30_000,
      client.callTool({ name: 'list_documents', arguments: {} }),
    );
    if (tree.isError === true) throw new Error(`list_documents failed: ${JSON.stringify(tree.content)}`);
    if (spec.projectType === 'arduino') {
      // The bundled drivers must actually load: their actions show up as `driver-action::…` node kinds.
      const kinds = await withTimeout(
        'mcp get_node_kinds',
        30_000,
        client.callTool({ name: 'get_node_kinds', arguments: { documentType: 'function' } }),
      );
      if (!JSON.stringify(kinds.content).includes('driver-action::')) {
        throw new Error(
          `no driver-action node kinds — bundled drivers did not load: ${JSON.stringify(kinds.content).slice(0, 300)}`,
        );
      }
    }
    console.log(`  MCP server answered: ${tools.length} tools, list_documents ok`);
  } finally {
    await client.close();
  }
};

const checkWindow = async (app: IPackagedApp, tempDir: string, screenshot: string | null): Promise<void> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  }
  // A fresh userData directory, so the run never depends on (or touches) a real profile.
  env.XDG_CONFIG_HOME = path.join(tempDir, 'config');
  // Linux CI runners restrict unprivileged user namespaces, which Chromium's sandbox needs; the
  // smoke test is about packaging, not the sandbox.
  const args = process.platform === 'linux' ? ['--no-sandbox'] : [];
  const electronApp = await electron.launch({ executablePath: app.binary, args, env, timeout: 60_000 });
  try {
    const window = await electronApp.firstWindow({ timeout: 60_000 });
    const pageErrors: string[] = [];
    window.on('pageerror', (error) => pageErrors.push(error.message));
    await window.waitForLoadState('load');
    await window.locator('#root > *').first().waitFor({ state: 'visible', timeout: 30_000 });
    // Give lazy chunks a moment to throw, if they are going to.
    await window.waitForTimeout(2000);
    if (screenshot) await window.screenshot({ path: screenshot });
    if (pageErrors.length > 0) throw new Error(`page errors:\n${pageErrors.join('\n')}`);
    console.log(`  window rendered: "${await window.title()}"`);
  } finally {
    await electronApp.close();
  }
};

const main = async (): Promise<void> => {
  const kind = process.argv[2] as TAppKind | undefined;
  if (kind !== 'sketch' && kind !== 'arduino') {
    throw new Error('usage: smoke-desktop-app.ts <sketch|arduino> [--screenshot <file.png>]');
  }
  const screenshotIndex = process.argv.indexOf('--screenshot');
  const screenshot = screenshotIndex === -1 ? null : path.resolve(process.argv[screenshotIndex + 1]);
  const spec = APPS[kind];
  const app = locatePackagedApp(spec.appDir, spec);
  console.log(`Smoke-testing ${kind}: ${app.binary}`);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `falang-smoke-${kind}-`));
  try {
    console.log('1/3 bundled worker');
    await checkWorker(app, spec, tempDir);
    console.log('2/3 bundled MCP server');
    await checkMcpServer(app, spec, tempDir);
    console.log('3/3 application window');
    await checkWindow(app, tempDir, screenshot);
    console.log('Smoke test passed.');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});

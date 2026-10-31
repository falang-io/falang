/* oxlint-disable no-console, no-await-in-loop, no-undefined, unicorn/no-await-expression-member -- a CI script: its console output is the report; polling loops. */
/**
 * The Falang Flow part of `smoke-desktop-app.ts` (ADR 0072 (private)): boots the packaged shell with a throwaway
 * userData (`FALANG_FLOW_USER_DATA`, test-only), checks it signs in as admin, builds and runs a function through the
 * backend staged under userData (Temporal, PGlite, a runner child process), quits and looks for leftover processes.
 */
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { _electron as electron } from 'playwright';
import {
  buildLogNode,
  buildSingleFunctionFixture,
} from '@falang/workflow-backend/src/test-utils/workflow-e2e-fixtures.js';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Processes whose command line mentions `needle` (the throwaway userData dir) — leftovers after the app quit. */
const findProcesses = (needle: string): string[] => {
  if (process.platform === 'win32') return [];
  const out = execFileSync('ps', ['-eo', 'pid,args'], { encoding: 'utf8' });
  return out.split('\n').filter((line) => line.includes(needle) && !line.includes('smoke-desktop-app'));
};

interface IFlowStatus {
  readonly url: string;
  readonly internalUrl: string;
  readonly controlToken: string;
}

/** Falang Flow: boot the packaged shell, sign in, build + run a function through the real stack, quit, no leftovers. */
export const smokeFlow = async (app: { readonly binary: string }, screenshot: string | null): Promise<void> => {
  console.log(`Smoke-testing flow: ${app.binary}`);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'falang-smoke-flow-'));
  const userData = path.join(tempDir, 'userData');
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  }
  env.FALANG_FLOW_USER_DATA = userData;
  const args = process.platform === 'linux' ? ['--no-sandbox'] : [];
  const started = Date.now();
  const electronApp = await electron.launch({ executablePath: app.binary, args, env, timeout: 60_000 });
  let closed = false;
  electronApp.process().stdout?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString('utf8').split('\n')) {
      if (line.includes('[flow]') || line.includes('[local]')) console.log(`  app: ${line}`);
    }
  });
  try {
    const window = await electronApp.firstWindow({ timeout: 60_000 });
    console.log('1/4 first start (staging the backend, starting Temporal, PGlite, the backend)');
    await window.waitForURL(/^http:\/\/localhost:\d+\/(?!health)/, { timeout: 300_000 });
    console.log(`  product url ${window.url()} after ${Math.round((Date.now() - started) / 1000)} s`);
    // Signed in as the seeded admin: the default-password banner only exists for a signed-in `admin`.
    await window
      .getByText(/default admin password/i)
      .first()
      .waitFor({ timeout: 60_000 });
    console.log(`  signed in as admin; title "${await window.title()}"`);
    if (screenshot) await window.screenshot({ path: screenshot });

    console.log('2/4 build and run a function through the staged backend');
    const statusFile = path.join(userData, 'flow', 'status.json');
    const status = JSON.parse(await fs.readFile(statusFile, 'utf8')) as IFlowStatus;
    const login = await fetch(`${status.internalUrl}/internal/local/auto-login`, {
      method: 'POST',
      headers: { 'x-local-control-token': status.controlToken },
    });
    if (!login.ok) throw new Error(`auto-login failed: ${login.status}`);
    const token = ((await login.json()) as { accessToken: string }).accessToken;
    const call = (method: string, route: string, body?: unknown): Promise<Response> =>
      fetch(`${status.url}${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const imported = await call(
      'POST',
      '/projects/import',
      buildSingleFunctionFixture(`Smoke ${Date.now()}`, 'greet', [buildLogNode('l1', 'hello from the packaged app')]),
    );
    if (imported.status !== 201) throw new Error(`import failed: ${imported.status} ${await imported.text()}`);
    const projectId = ((await imported.json()) as { id: string }).id;
    const buildStarted = Date.now();
    if ((await call('POST', `/projects/${projectId}/build`)).status !== 202) throw new Error('build was not accepted');
    const isRunning = async (running: boolean): Promise<boolean> =>
      ((await (await call('GET', `/projects/${projectId}/build/status`)).json()) as { running: boolean }).running ===
      running;
    const deadline = Date.now() + 240_000;
    while (!(await isRunning(true))) {
      if (Date.now() > deadline) throw new Error('the dev runner did not come up');
      await sleep(1000);
    }
    console.log(
      `  built (webpack bundle + type-check + runner child) in ${Math.round((Date.now() - buildStarted) / 1000)} s`,
    );
    const run = await call('POST', `/projects/${projectId}/run`, { functionName: 'greet', target: 'dev', args: [] });
    const runBody = (await run.json()) as { status?: string };
    if (run.status !== 201 || runBody.status !== 'completed') {
      throw new Error(`run failed: ${run.status} ${JSON.stringify(runBody)}`);
    }
    console.log(`  run status: ${runBody.status}`);
    await call('POST', `/projects/${projectId}/stop`);

    console.log('3/4 quit');
    await electronApp.close();
    closed = true;
    await sleep(3000);
    console.log('4/4 no leftover processes');
    const left = findProcesses(userData);
    if (left.length > 0) throw new Error(`processes survived the app:\n${left.join('\n')}`);
    console.log('Smoke test passed.');
  } finally {
    if (!closed) await electronApp.close().catch(() => null);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

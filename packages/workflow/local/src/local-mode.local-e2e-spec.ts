// oxlint-disable unicorn/prefer-module, no-undefined, unicorn/no-await-expression-member, init-declarations, no-promise-executor-return -- CommonJS package; a plain HTTP test client.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildLogNode,
  buildSingleFunctionFixture,
} from '@falang/workflow-backend/src/test-utils/workflow-e2e-fixtures.js';
import { findFreePort } from './temporal/index.js';

/**
 * The whole local mode, for real, started the way a user starts it (the CLI in a child process — TypeORM's migration
 * glob cannot load `.ts` files inside a Vitest worker): PGlite with the real migrations, the `temporal` CLI dev server, a process-backed
 * runner, disk file storage — driven over HTTP. Skipped when no `temporal` binary is found (set
 * `FALANG_LOCAL_E2E_DOWNLOAD=true` to let the test download one). Run via `npm run test-e2e:local`.
 */
const hasTemporal =
  Boolean(process.env.FALANG_TEMPORAL_CLI) || spawnSync('temporal', ['--version'], { stdio: 'ignore' }).status === 0;
const canRun = hasTemporal || process.env.FALANG_LOCAL_E2E_DOWNLOAD === 'true';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe.skipIf(!canRun)('local mode (no Docker)', () => {
  let dataDir = '';
  let cli: ChildProcess;
  let local = { url: '' };
  let token = '';

  const call = (
    method: string,
    route: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response> =>
    fetch(`${local.url}${route}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined && !(body instanceof Uint8Array) ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: body instanceof Uint8Array ? Buffer.from(body) : JSON.stringify(body) }),
    });

  const waitFor = async (condition: () => Promise<boolean>, timeoutMs: number): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      // oxlint-disable-next-line no-await-in-loop -- polling
      if (await condition()) return;
      // oxlint-disable-next-line no-await-in-loop -- polling
      await sleep(1000);
    }
    throw new Error('condition not met in time');
  };

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), 'falang-local-e2e-'));
    const port = await findFreePort();
    const internalPort = await findFreePort();
    local = { url: `http://localhost:${port}` };
    cli = spawn(
      process.execPath,
      [
        createRequire(__filename).resolve('tsx/cli'),
        path.join(__dirname, 'main.ts'),
        '--data-dir',
        dataDir,
        '--port',
        String(port),
        '--internal-port',
        String(internalPort),
        '--status-file',
        path.join(dataDir, 'status.json'),
        '--skip-client',
        '--no-browser',
        '--no-ui',
      ],
      { stdio: 'ignore' },
    );
    await waitFor(async () => (await fetch(`${local.url}/health`).catch(() => null))?.ok === true, 100_000);
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'admin' });
    expect(login.status).toBe(200);
    token = ((await login.json()) as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    if (cli && cli.exitCode === null) {
      const exited = new Promise<void>((resolve) => cli.once('exit', () => resolve()));
      cli.kill('SIGINT');
      await exited;
    }
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it('writes a status file and serves the control routes on the internal port only', async () => {
    const status = JSON.parse(await readFile(path.join(dataDir, 'status.json'), 'utf8')) as {
      url: string;
      internalUrl: string;
      controlToken: string;
      pid: number;
    };
    expect(status.url).toBe(local.url);
    expect(status.controlToken).toMatch(/^[0-9a-f]{64}$/);
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- local helper of this one test.
    const control = (base: string, route: string, tokenValue?: string): Promise<Response> =>
      fetch(`${base}/internal/local/${route}`, {
        method: 'POST',
        headers: tokenValue === undefined ? {} : { 'x-local-control-token': tokenValue },
      });
    expect((await control(status.internalUrl, 'auto-login')).status).toBe(403);
    expect((await control(status.internalUrl, 'auto-login', 'nope')).status).toBe(403);
    expect((await control(local.url, 'auto-login', status.controlToken)).status).toBe(404);
    const login = await control(status.internalUrl, 'auto-login', status.controlToken);
    expect(login.status).toBe(200);
    const { accessToken } = (await login.json()) as { accessToken: string };
    const me = await fetch(`${local.url}/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { username: string }).username).toBe('admin');
  });

  it('builds a function, runs it through a process runner and stops it', async () => {
    const fixture = buildSingleFunctionFixture(`Local mode ${Date.now()}`, 'greet', [
      buildLogNode('l1', 'hello local'),
    ]);
    const imported = await call('POST', '/projects/import', fixture);
    expect(imported.status).toBe(201);
    const projectId = ((await imported.json()) as { id: string }).id;
    expect((await call('POST', `/projects/${projectId}/build`)).status).toBe(202);
    const isRunning = async (running: boolean): Promise<boolean> =>
      ((await (await call('GET', `/projects/${projectId}/build/status`)).json()) as { running: boolean }).running ===
      running;
    await waitFor(() => isRunning(true), 90_000);
    const run = await call('POST', `/projects/${projectId}/run`, { functionName: 'greet', target: 'dev', args: [] });
    expect(run.status).toBe(201);
    expect(((await run.json()) as { status: string }).status).toBe('completed');
    expect((await call('POST', `/projects/${projectId}/stop`)).status).toBe(204);
    await waitFor(() => isRunning(false), 30_000);
  });

  it('stores uploaded files on disk and reads them back', async () => {
    const created = await call('POST', '/projects', { name: `Files ${Date.now()}` });
    const projectId = ((await created.json()) as { id: string }).id;
    const upload = await call('POST', `/projects/${projectId}/files`, new TextEncoder().encode('disk hello'), {
      'x-file-name': 'a.txt',
      'content-type': 'text/plain',
    });
    expect(upload.status).toBe(201);
    const file = (await upload.json()) as { id: string; size: number };
    expect(file.size).toBe(10);
    const download = await call('GET', `/projects/${projectId}/files/${file.id}`);
    expect(await download.text()).toBe('disk hello');
  });
});

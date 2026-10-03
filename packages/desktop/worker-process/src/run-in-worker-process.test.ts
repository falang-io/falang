// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runInWorkerProcess, WorkerCancelledError } from './run-in-worker-process.js';

// Real process spawn end to end, same posture as `@falang/desktop-mcp`'s own `e2e.test.ts` — a fixture
// entry point run via the repo's own `tsx`, not a mocked `child_process`.
const repoRoot = path.resolve(__dirname, '../../../..');
const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx');
const fixturePath = path.join(__dirname, 'test-fixtures', 'echo-worker.ts');

const command = { command: tsxBin, args: [fixturePath] };

describe('runInWorkerProcess', () => {
  it('reports progress and resolves the result', async () => {
    const progress: { done: number; total: number }[] = [];
    const handle = runInWorkerProcess<{ steps: number }, { done: number; total: number }, { stepsCompleted: number }>({
      command,
      job: { steps: 3 },
      onProgress: (p) => progress.push(p),
    });
    await expect(handle.result).resolves.toEqual({ stepsCompleted: 3 });
    expect(progress).toEqual([
      { done: 1, total: 3 },
      { done: 2, total: 3 },
      { done: 3, total: 3 },
    ]);
  }, 15_000);

  it('rejects with the worker-reported error message', async () => {
    const handle = runInWorkerProcess<{ steps: number; failAt: number }, unknown, unknown>({
      command,
      job: { steps: 3, failAt: 2 },
    });
    await expect(handle.result).rejects.toThrow('failed at step 2');
  }, 15_000);

  it('rejects with WorkerCancelledError when cancelled mid-job', async () => {
    const handle = runInWorkerProcess<{ steps: number; delayMs: number }, unknown, unknown>({
      command,
      job: { steps: 10, delayMs: 200 },
    });
    setTimeout(() => handle.cancel(), 100);
    await expect(handle.result).rejects.toBeInstanceOf(WorkerCancelledError);
  }, 15_000);

  it('layers the command env over the parent environment', async () => {
    const handle = runInWorkerProcess<{ steps: number; echoEnv: string }, unknown, { env: string | null }>({
      command: { ...command, env: { FALANG_WORKER_TEST_VAR: 'from-command' } },
      job: { steps: 0, echoEnv: 'FALANG_WORKER_TEST_VAR' },
    });
    await expect(handle.result).resolves.toMatchObject({ env: 'from-command' });
    // PATH still comes through from the parent: the command env is added, not substituted.
    const pathHandle = runInWorkerProcess<{ steps: number; echoEnv: string }, unknown, { env: string | null }>({
      command: { ...command, env: { FALANG_WORKER_TEST_VAR: 'x' } },
      job: { steps: 0, echoEnv: 'PATH' },
    });
    await expect(pathHandle.result).resolves.toMatchObject({ env: process.env.PATH ?? null });
  }, 15_000);

  it('rejects when the command cannot be spawned at all', async () => {
    const handle = runInWorkerProcess<unknown, unknown, unknown>({
      command: { command: path.join(repoRoot, 'does-not-exist-binary'), args: [] },
      job: {},
    });
    await expect(handle.result).rejects.toThrow();
  });
});

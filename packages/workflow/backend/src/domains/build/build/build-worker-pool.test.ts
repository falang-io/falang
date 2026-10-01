// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBuildWorker } from './build-worker-pool.js';

vi.setConfig({ testTimeout: 30_000 });

const workerEntry = join(__dirname, 'test-build-worker.fixture.ts');
const job = (workflows: string) => ({ workflows, activities: '', workDir: '', bundle: false });

describe('runBuildWorker', () => {
  afterEach(() => {
    delete process.env.BUILD_WORKER_CONCURRENCY;
    delete process.env.BUILD_WORKER_TIMEOUT_MS;
    delete process.env.SECRET_BACKEND_VALUE;
  });

  it('kills a build that exceeds the timeout', async () => {
    const startedAt = Date.now();
    await expect(runBuildWorker(job('hang'), { workerEntry, timeoutMs: 1500 })).rejects.toThrow(
      /timed out after 1500 ms/,
    );
    expect(Date.now() - startedAt).toBeLessThan(10_000);
  });

  it('reads the timeout from BUILD_WORKER_TIMEOUT_MS', async () => {
    process.env.BUILD_WORKER_TIMEOUT_MS = '1200';
    await expect(runBuildWorker(job('hang'), { workerEntry })).rejects.toThrow(/timed out after 1200 ms/);
  });

  it('reports a crashed build process', async () => {
    await expect(runBuildWorker(job('crash'), { workerEntry })).rejects.toThrow(/exited unexpectedly \(code 3\)/);
  });

  it('starts the child with an empty environment — no backend secrets', async () => {
    process.env.SECRET_BACKEND_VALUE = 'super-secret';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'jwt-secret-for-test';
    const result = await runBuildWorker(job('env'), { workerEntry });
    expect(result.kind).toBe('errors');
    const childEnv = JSON.parse(
      (result as unknown as { errors: { documentName: string }[] }).errors[0].documentName,
    ) as Record<string, string>;
    expect(childEnv.SECRET_BACKEND_VALUE).toBeUndefined();
    expect(childEnv.JWT_SECRET).toBeUndefined();
    expect(childEnv.HOME).toBe('/tmp');
    expect(Object.keys(childEnv).toSorted()).toEqual(expect.arrayContaining(['HOME', 'PATH']));
    expect(Object.keys(childEnv).length).toBeLessThanOrEqual(5);
  });

  it('queues builds beyond BUILD_WORKER_CONCURRENCY', async () => {
    process.env.BUILD_WORKER_CONCURRENCY = '1';
    const spans = await Promise.all(
      [1, 2].map(async () => {
        const result = await runBuildWorker(job('slow'), { workerEntry });
        const [error] = (result as unknown as { errors: { documentId: string; documentName: string }[] }).errors;
        return { start: Number(error.documentId), end: Number(error.documentName) };
      }),
    );
    const [first, second] = spans.toSorted((a, b) => a.start - b.start);
    // The second child only started after the first one had reported.
    expect(second.start).toBeGreaterThanOrEqual(first.end - 50);
  });
});

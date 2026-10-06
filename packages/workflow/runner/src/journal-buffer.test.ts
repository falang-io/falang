/* oxlint-disable no-plusplus, no-undefined, no-void, no-empty-function, require-await, no-inline-comments, no-non-null-assertion, no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JournalBuffer, envFromTaskQueue } from './journal-buffer.js';
import type { IJournalWireEntry } from './journal-types.js';

const entry = (n: number, runId: string | null = 'r1'): IJournalWireEntry => ({
  workflowId: 'wf',
  runId,
  sourceKey: `${runId}:w:${n}`,
  kind: 'log',
  level: 'info',
  message: `m${n}`,
  data: null,
  documentId: null,
  nodeId: null,
  vendor: null,
  ts: n,
});

const okFetch = () => vi.fn().mockResolvedValue({ ok: true, status: 204 });
const make = (fetch: ReturnType<typeof okFetch>, extra: object = {}) =>
  new JournalBuffer({
    backendUrl: 'http://backend:3001/',
    projectId: 'p1',
    projectToken: 'tok',
    env: 'dev',
    buildId: 'b1',
    fetch,
    ...extra,
  });

describe('JournalBuffer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('derives env from the task queue', () => {
    expect(envFromTaskQueue('workflow-dev-abc')).toBe('dev');
    expect(envFromTaskQueue('workflow-abc-v1')).toBe('prod');
  });

  it('flushes after ~1s with the contract request shape', async () => {
    const fetch = okFetch();
    const buffer = make(fetch);
    buffer.push(entry(1));
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://backend:3001/internal/projects/p1/run-journal');
    expect(init.headers['x-internal-project-token']).toBe('tok');
    expect(JSON.parse(init.body)).toMatchObject({ env: 'dev', buildId: 'b1', entries: [{ message: 'm1' }] });
    expect(buffer.size).toBe(0);
    buffer.dispose();
  });

  it('flushes at 100 queued entries and splits batches at 500', async () => {
    const fetch = okFetch();
    const buffer = make(fetch);
    for (let i = 0; i < 100; i++) buffer.push(entry(i));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 1200; i++) buffer.push(entry(i));
    await buffer.flush();
    const sizes = fetch.mock.calls.map((c) => JSON.parse(c[1].body).entries.length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(500);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(1300);
    buffer.dispose();
  });

  it('keeps entries and retries with backoff on failure', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValue({ ok: true, status: 204 });
    const onError = vi.fn();
    const buffer = make(fetch, { onError });
    buffer.push(entry(1));
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(buffer.size).toBe(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetch).toHaveBeenCalledTimes(1); // backoff 2s after the first failure
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(buffer.size).toBe(0);
    expect(onError).toHaveBeenCalledTimes(2);
    buffer.dispose();
  });

  it('drops the oldest on overflow and reports one lost entry per run', async () => {
    const fetch = okFetch();
    const buffer = make(fetch, { maxEntries: 3 });
    for (let i = 1; i <= 4; i++) buffer.push(entry(i, 'r1'));
    buffer.push(entry(5, 'r2')); // drops m1, m2
    expect(buffer.size).toBe(3);
    await buffer.flush();
    const bodies = fetch.mock.calls.map((c) => JSON.parse(c[1].body).entries as IJournalWireEntry[]);
    const all = bodies.flat();
    expect(all.map((e) => e.message)).toEqual(['m3', 'm4', 'm5', '2 journal entries lost']);
    const lost = all.at(-1)!;
    expect(lost).toMatchObject({ kind: 'error', level: 'warn', runId: 'r1', sourceKey: 'r1:lost:1' });
    buffer.dispose();
  });

  it('push never throws and flush stops at the first failure', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('down'));
    const buffer = make(fetch);
    buffer.push(entry(1));
    await buffer.flush(500);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(buffer.size).toBe(1);
    buffer.dispose();
    expect(() => buffer.push(entry(2))).not.toThrow();
  });

  it('flush on shutdown sends what is queued', async () => {
    const fetch = okFetch();
    const buffer = make(fetch);
    buffer.push(entry(1));
    buffer.push(entry(2));
    await buffer.flush();
    expect(JSON.parse(fetch.mock.calls[0][1].body).entries).toHaveLength(2);
    buffer.dispose();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingSaves } from './pending-saves.js';

const settle = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

const noop = (): void => {
  // placeholder until the promise executor assigns the real one
};

/** A promise settled by hand. */
const deferred = <T = void>() => {
  let resolve: (value: T) => void = noop;
  let reject: (error: unknown) => void = noop;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('PendingSaves', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not start a second save of one id before the first settled, and collapses waiting ones', async () => {
    const onError = vi.fn();
    const saves = new PendingSaves(100, onError);
    const resolvers: (() => void)[] = [];
    const run = (label: string, log: string[]) => () => {
      log.push(label);
      const d = deferred();
      resolvers.push(d.resolve);
      return d.promise;
    };
    const log: string[] = [];
    saves.schedule('a', run('1', log));
    vi.advanceTimersByTime(100);
    for (const l of ['2', '3', '4']) {
      saves.schedule('a', run(l, log));
      vi.advanceTimersByTime(100);
    }
    await settle();
    expect(log).toEqual(['1']);
    resolvers[0]();
    await settle();
    expect(log).toEqual(['1', '4']);
    resolvers[1]();
    await settle();
    expect(onError).not.toHaveBeenCalled();
  });

  it('a rejected save goes to onError and does not stall the chain', async () => {
    const onError = vi.fn();
    const saves = new PendingSaves(100, onError);
    const first = deferred();
    saves.schedule('a', () => first.promise);
    vi.advanceTimersByTime(100);
    const second = vi.fn(() => Promise.resolve());
    saves.schedule('a', second);
    vi.advanceTimersByTime(100);
    first.reject(new Error('x'));
    await settle();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('exclusive runs after the in-flight save and propagates its own error', async () => {
    const saves = new PendingSaves(100, vi.fn());
    const inflight = deferred();
    saves.schedule('a', () => inflight.promise);
    vi.advanceTimersByTime(100);
    const task = vi.fn(() => Promise.reject(new Error('own')));
    const result = saves.exclusive('a', task);
    const caught = result.catch((error: Error) => error.message);
    await settle();
    expect(task).not.toHaveBeenCalled();
    inflight.resolve();
    expect(await caught).toBe('own');
    const next = vi.fn(() => Promise.resolve(1));
    expect(await saves.exclusive('a', next)).toBe(1);
  });

  it('cancel drops a queued save that has not started', async () => {
    const saves = new PendingSaves(100, vi.fn());
    const inflight = deferred();
    saves.schedule('a', () => inflight.promise);
    vi.advanceTimersByTime(100);
    const queued = vi.fn(() => Promise.resolve());
    saves.schedule('a', queued);
    vi.advanceTimersByTime(100);
    saves.cancel('a');
    inflight.resolve();
    await settle();
    expect(queued).not.toHaveBeenCalled();
  });
});

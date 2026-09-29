import { describe, expect, it, vi } from 'vitest';
import { terminateRunningExecutionsWith, type ITerminatableWorkflowHandle } from './terminate-running-executions.js';

const buildFakeHandle = (options: {
  readonly cancel?: () => Promise<void>;
  readonly terminate?: (reason: string) => Promise<void>;
  /** Sequence of answers `isRunning()` returns on successive polls — the last value repeats once exhausted. */
  readonly runningSequence: readonly boolean[];
}): ITerminatableWorkflowHandle => {
  let callIndex = 0;
  const isRunning = vi.fn((): Promise<boolean> => {
    const value = options.runningSequence[Math.min(callIndex, options.runningSequence.length - 1)];
    callIndex += 1;
    return Promise.resolve(value);
  });
  return {
    cancel: options.cancel ?? vi.fn<() => Promise<void>>(() => Promise.resolve()),
    isRunning,
    terminate: options.terminate ?? vi.fn<(reason: string) => Promise<void>>(() => Promise.resolve()),
  };
};

describe('terminateRunningExecutionsWith', () => {
  it('returns 0 and does nothing when there are no running executions', async () => {
    const listRunning = vi.fn(() => Promise.resolve([]));
    const count = await terminateRunningExecutionsWith({ listRunning }, 'workflow-dev-p1', 10_000);
    expect(count).toBe(0);
  });

  it('cancels every execution first, never terminating one that finishes within the grace window', async () => {
    const handle = buildFakeHandle({ runningSequence: [false] });
    const listRunning = vi.fn(() => Promise.resolve([handle]));
    const sleep = vi.fn(() => Promise.resolve());

    const count = await terminateRunningExecutionsWith({ listRunning, sleep }, 'workflow-dev-p1', 10_000);

    expect(count).toBe(1);
    expect(handle.cancel).toHaveBeenCalledTimes(1);
    expect(handle.terminate).not.toHaveBeenCalled();
  });

  it('force-terminates whatever is still running once the grace window elapses', async () => {
    const handle = buildFakeHandle({ runningSequence: [true, true, true] });
    const listRunning = vi.fn(() => Promise.resolve([handle]));
    const sleep = vi.fn(() => Promise.resolve());
    // A `now()` that advances past the deadline on the second read, so the poll loop runs exactly
    // once (one `isRunning()` check, still `true`) before falling back to `terminate()` — no real
    // waiting needed.
    let calls = 0;
    const now = vi.fn(() => {
      calls += 1;
      return calls === 1 ? 0 : 20_000;
    });

    const count = await terminateRunningExecutionsWith({ listRunning, now, sleep }, 'workflow-dev-p1', 10_000);

    expect(count).toBe(1);
    expect(handle.cancel).toHaveBeenCalledTimes(1);
    expect(handle.terminate).toHaveBeenCalledWith('dev rebuild: workflow code changed');
  });

  it('polls until an execution stops running, then never terminates it', async () => {
    const handle = buildFakeHandle({ runningSequence: [true, true, false] });
    const listRunning = vi.fn(() => Promise.resolve([handle]));
    const sleep = vi.fn(() => Promise.resolve());
    // `now()` never reaches the deadline, so the loop only exits once `isRunning()` reports `false`.
    const now = vi.fn(() => 0);

    const count = await terminateRunningExecutionsWith({ listRunning, now, sleep }, 'workflow-dev-p1', 10_000);

    expect(count).toBe(1);
    expect(handle.isRunning).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(handle.terminate).not.toHaveBeenCalled();
  });

  it('handles a mix — one finishes in time, the other has to be terminated', async () => {
    const finishesInTime = buildFakeHandle({ runningSequence: [false] });
    const staysRunning = buildFakeHandle({ runningSequence: [true, true] });
    const listRunning = vi.fn(() => Promise.resolve([finishesInTime, staysRunning]));
    const sleep = vi.fn(() => Promise.resolve());
    let calls = 0;
    const now = vi.fn(() => {
      calls += 1;
      return calls === 1 ? 0 : 20_000;
    });

    const count = await terminateRunningExecutionsWith({ listRunning, now, sleep }, 'workflow-dev-p1', 10_000);

    expect(count).toBe(2);
    expect(finishesInTime.cancel).toHaveBeenCalledTimes(1);
    expect(finishesInTime.terminate).not.toHaveBeenCalled();
    expect(staysRunning.cancel).toHaveBeenCalledTimes(1);
    expect(staysRunning.terminate).toHaveBeenCalledTimes(1);
  });

  it('passes taskQueue through to listRunning', async () => {
    const listRunning = vi.fn(() => Promise.resolve([]));
    await terminateRunningExecutionsWith({ listRunning }, 'workflow-dev-p42', 10_000);
    expect(listRunning).toHaveBeenCalledWith('workflow-dev-p42');
  });
});

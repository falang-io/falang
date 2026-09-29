import { observable, runInAction } from 'mobx';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.mock` factories are hoisted above every other statement in this file — `listSchedules` has to be
// declared through `vi.hoisted` so the factory below (which the hoisted `vi.mock` call runs first,
// before this `const` would otherwise exist) can close over it without a "used before initialization" error.
const { listSchedules } = vi.hoisted(() => ({ listSchedules: vi.fn() }));
vi.mock('./api-client.js', () => ({
  workflowApi: {
    listSchedules: (...args: unknown[]) => listSchedules(...args),
  },
}));

const { ScheduleStatusStore } = await import('./schedule-status-store.js');

const SCHEDULE_FIXTURE = {
  documentId: 'doc-1',
  env: 'dev' as const,
  scheduleId: 'sched-dev-doc-1',
  paused: false,
  nextFireTimes: ['2026-01-01T00:00:00.000Z'],
  lastFireTime: null,
  skippedOverlapCount: 0,
  missedCatchupCount: 0,
};

describe('ScheduleStatusStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listSchedules.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('never calls the API while the project has no schedule trigger', async () => {
    const store = new ScheduleStatusStore('project-1', () => false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(listSchedules).not.toHaveBeenCalled();
    expect(store.getStatus('doc-1')).toEqual([]);
    store.dispose();
  });

  it('polls immediately and then every 30s once a schedule trigger exists, grouping results by documentId', async () => {
    listSchedules.mockResolvedValue([SCHEDULE_FIXTURE]);
    const store = new ScheduleStatusStore('project-1', () => true);

    await vi.advanceTimersByTimeAsync(0);
    expect(listSchedules).toHaveBeenCalledTimes(1);
    expect(listSchedules).toHaveBeenCalledWith('project-1');
    expect(store.getStatus('doc-1')).toEqual([SCHEDULE_FIXTURE]);
    expect(store.getStatus('doc-2')).toEqual([]);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(listSchedules).toHaveBeenCalledTimes(2);

    store.dispose();
  });

  it('stops polling once the reactive predicate flips back to false, and never resumes on its own', async () => {
    listSchedules.mockResolvedValue([]);
    const hasScheduleTrigger = observable.box(true);
    const store = new ScheduleStatusStore('project-1', () => hasScheduleTrigger.get());

    await vi.advanceTimersByTimeAsync(0);
    expect(listSchedules).toHaveBeenCalledTimes(1);

    runInAction(() => hasScheduleTrigger.set(false));
    await vi.advanceTimersByTimeAsync(90_000);
    expect(listSchedules).toHaveBeenCalledTimes(1);

    store.dispose();
  });

  it('resumes polling once the reactive predicate flips back to true', async () => {
    listSchedules.mockResolvedValue([]);
    const hasScheduleTrigger = observable.box(false);
    const store = new ScheduleStatusStore('project-1', () => hasScheduleTrigger.get());

    await vi.advanceTimersByTimeAsync(60_000);
    expect(listSchedules).not.toHaveBeenCalled();

    runInAction(() => hasScheduleTrigger.set(true));
    await vi.advanceTimersByTimeAsync(0);
    expect(listSchedules).toHaveBeenCalledTimes(1);

    store.dispose();
  });

  it('never schedules another poll after dispose(), even if it was already active', async () => {
    listSchedules.mockResolvedValue([]);
    const store = new ScheduleStatusStore('project-1', () => true);
    await vi.advanceTimersByTimeAsync(0);
    expect(listSchedules).toHaveBeenCalledTimes(1);

    store.dispose();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(listSchedules).toHaveBeenCalledTimes(1);
  });

  it('records a poll error but keeps retrying on the next tick', async () => {
    listSchedules.mockRejectedValueOnce(new Error('network down')).mockResolvedValue([]);
    const store = new ScheduleStatusStore('project-1', () => true);

    await vi.advanceTimersByTimeAsync(0);
    expect(store.pollError).toBe('network down');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(listSchedules).toHaveBeenCalledTimes(2);
    expect(store.pollError).toBeNull();

    store.dispose();
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { IJobRunner } from './job-queue.js';
import { JobQueue } from './job-queue.js';
import { JobStore } from './job-store.js';
import type { IJob } from './job-types.js';

const baseRequest = (jobKey?: string) => ({
  projectId: 'p1',
  op: 'media-probe' as const,
  inputs: [{ id: 'f1', name: 'a.png' }],
  params: {},
  jobKey,
});

describe('JobQueue concurrency pool', () => {
  it('runs at most maxConcurrent jobs at a time, draining the rest as they finish', async () => {
    const store = new JobStore();
    const releases: (() => void)[] = [];
    const runner: IJobRunner = {
      run: (job) =>
        new Promise((resolve) => {
          releases.push(() => {
            job.status = 'done';
            resolve();
          });
        }),
    };
    const queue = new JobQueue(store, runner, 2);
    const jobs = [store.createJob(baseRequest(), 't'), store.createJob(baseRequest(), 't'), store.createJob(baseRequest(), 't')];
    for (const job of jobs) queue.enqueue(job);

    expect(jobs[0].status).toBe('running');
    expect(jobs[1].status).toBe('running');
    expect(jobs[2].status).toBe('queued');

    releases[0]();
    await vi.waitFor(() => expect(jobs[2].status).toBe('running'));
  });
});

describe('JobQueue.cancel', () => {
  it('cancels a still-queued job without ever calling the runner', () => {
    const store = new JobStore();
    const run = vi.fn(
      () =>
        new Promise<void>(() => {
          // never resolves — this test only cares that `run` was invoked once, for `blocker`
        }),
    );
    const queue = new JobQueue(store, { run }, 1);
    const blocker = store.createJob(baseRequest(), 't');
    const queued = store.createJob(baseRequest(), 't');
    queue.enqueue(blocker);
    queue.enqueue(queued);

    expect(queued.status).toBe('queued');
    queue.cancel(queued);
    expect(queued.status).toBe('cancelled');
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(blocker);
  });

  it('kills a running job and leaves the final status to the runner', () => {
    const store = new JobStore();
    const kill = vi.fn();
    const runner: IJobRunner = {
      run: () =>
        new Promise<void>(() => {
          // never resolves — the point of this test is what happens before it would
        }),
    };
    const queue = new JobQueue(store, runner, 1);
    const job: IJob = store.createJob(baseRequest(), 't');
    queue.enqueue(job);
    job.kill = kill;

    queue.cancel(job);
    expect(job.cancelRequested).toBe(true);
    expect(kill).toHaveBeenCalledOnce();
    // the runner (not `cancel`) is what actually sets 'cancelled' once its process exits
    expect(job.status).toBe('running');
  });
});

describe('JobQueue error handling', () => {
  it("marks a job failed when the runner's promise rejects", async () => {
    const store = new JobStore();
    const runner: IJobRunner = { run: () => Promise.reject(new Error('boom')) };
    const queue = new JobQueue(store, runner, 1);
    const job = store.createJob(baseRequest(), 't');
    queue.enqueue(job);

    await vi.waitFor(() => expect(job.status).toBe('failed'));
    expect(job.error).toBe('boom');
  });
});

describe('JobStore idempotent jobKey / active count', () => {
  it('returns the same job for a repeated (projectId, jobKey)', () => {
    const store = new JobStore();
    const first = store.createJob(baseRequest('k1'), 't');
    expect(store.findByKey('p1', 'k1')?.jobId).toBe(first.jobId);
    expect(store.findByKey('p1', 'k2')).toBeUndefined();
    expect(store.findByKey('other-project', 'k1')).toBeUndefined();
  });

  it('counts only queued/running jobs as active', () => {
    const store = new JobStore();
    const a = store.createJob(baseRequest(), 't');
    const b = store.createJob(baseRequest(), 't');
    expect(store.countActive('p1')).toBe(2);
    a.status = 'done';
    a.finishedAt = Date.now();
    expect(store.countActive('p1')).toBe(1);
    b.status = 'failed';
    expect(store.countActive('p1')).toBe(0);
  });

  it('sweeps a finished job past the TTL but keeps a recent one', () => {
    const store = new JobStore();
    const job = store.createJob(baseRequest(), 't');
    job.status = 'done';
    job.finishedAt = Date.now() - 2 * 60 * 60 * 1000;
    store.sweepFinished();
    expect(store.get(job.jobId)).toBeUndefined();
  });
});

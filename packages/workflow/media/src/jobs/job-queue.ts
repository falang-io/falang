import type { JobStore } from './job-store.js';
import type { IJob } from './job-types.js';

export interface IJobRunner {
  run(job: IJob): Promise<void>;
}

/** A bounded worker pool draining an in-memory FIFO queue — `MEDIA_MAX_CONCURRENT_JOBS` jobs run
 * at once across every project; `MEDIA_MAX_JOBS_PER_PROJECT` (checked by the caller before
 * `enqueue`, via `JobStore.countActive`) is the separate per-tenant cap. */
export class JobQueue {
  private readonly pending: string[] = [];
  private runningCount = 0;
  private readonly store: JobStore;
  private readonly runner: IJobRunner;
  private readonly maxConcurrent: number;

  constructor(store: JobStore, runner: IJobRunner, maxConcurrent: number) {
    this.store = store;
    this.runner = runner;
    this.maxConcurrent = maxConcurrent;
  }

  enqueue(job: IJob): void {
    this.pending.push(job.jobId);
    this.drain();
  }

  /** Cancelling a still-queued job just flips its status — `drain()`'s own dequeue check skips
   * anything no longer `'queued'`. Cancelling a running job kills its ffmpeg child; `job-runner.ts`
   * is the one that turns that into a final `'cancelled'` status once the process actually exits. */
  cancel(job: IJob): void {
    if (job.status === 'queued') {
      job.status = 'cancelled';
      job.finishedAt = Date.now();
      return;
    }
    if (job.status === 'running') {
      job.cancelRequested = true;
      job.kill?.();
    }
  }

  private drain(): void {
    while (this.runningCount < this.maxConcurrent && this.pending.length > 0) {
      const jobId = this.pending.shift();
      if (!jobId) break;
      const job = this.store.get(jobId);
      if (!job || job.status !== 'queued') continue;
      this.runOne(job);
    }
  }

  private runOne(job: IJob): void {
    this.runningCount += 1;
    job.status = 'running';
    this.runner
      .run(job)
      .catch((error: unknown) => {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        job.finishedAt = job.finishedAt ?? Date.now();
        this.runningCount -= 1;
        this.drain();
      });
  }
}

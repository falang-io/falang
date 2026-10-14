// oxlint-disable no-console, no-void
import type { IValidationIssue } from './validation.types.js';

export interface IValidationJob {
  /** Which scheme the job belongs to (unique per scheme instance). */
  schemeKey: string;
  nodeId: string;
  source: string;
  check: () => IValidationIssue[] | Promise<IValidationIssue[]>;
  /** Called with the result iff the job is still current. */
  apply: (issues: IValidationIssue[]) => void;
  /** Called exactly once instead of `apply` when the job was replaced, cancelled or its result went stale. */
  discard?: () => void;
}

export interface IValidationQueueOptions {
  /** Max checks in flight. Default 1. */
  concurrency?: number;
  /** How the queue defers starting work. Default `setTimeout(fn, 0)`, so a burst of enqueues never blocks the UI. */
  schedule?: (fn: () => void) => void;
}

interface IQueuedJob extends IValidationJob {
  version: number;
}

const jobKey = (schemeKey: string, nodeId: string, source: string) => `${schemeKey}\u0000${nodeId}\u0000${source}`;

/**
 * Background queue for validation checks, shared by every scheme of a window (Monaco's TypeScript worker is one
 * global worker). FIFO; jobs of the priority scheme (the active tab) go first; a newer job for the same
 * `(scheme, node, source)` replaces a queued one and makes a running one's result stale; at most `concurrency`
 * checks run at once. A throwing `check` is logged and counts as "no issues".
 */
export class ValidationQueue {
  private readonly concurrency: number;
  private readonly scheduleFn: (fn: () => void) => void;
  private readonly queued = new Map<string, IQueuedJob>();
  /** Latest version per scheme per job key; a missing entry means "cancelled". */
  private readonly versions = new Map<string, Map<string, number>>();
  private running = 0;
  private scheduled = false;
  private priorityScheme: string | null = null;
  private idleWaiters: (() => void)[] = [];

  constructor(options: IValidationQueueOptions = {}) {
    this.concurrency = Math.max(1, options.concurrency ?? 1);
    this.scheduleFn = options.schedule ?? ((fn) => void setTimeout(fn, 0));
  }

  /** Jobs of this scheme are taken before everyone else's. `null` — no priority. */
  setPriorityScheme(schemeKey: string | null) {
    this.priorityScheme = schemeKey;
  }

  get pendingCount(): number {
    return this.queued.size + this.running;
  }

  enqueue(job: IValidationJob) {
    const key = jobKey(job.schemeKey, job.nodeId, job.source);
    let versions = this.versions.get(job.schemeKey);
    if (!versions) {
      versions = new Map();
      this.versions.set(job.schemeKey, versions);
    }
    const version = (versions.get(key) ?? 0) + 1;
    versions.set(key, version);
    const previous = this.queued.get(key);
    if (previous) previous.discard?.();
    this.queued.set(key, { ...job, version });
    this.schedule();
  }

  /** Drops the queued job and makes a running one's result stale. */
  cancel(schemeKey: string, nodeId: string, source: string) {
    const key = jobKey(schemeKey, nodeId, source);
    this.queued.get(key)?.discard?.();
    this.queued.delete(key);
    this.versions.get(schemeKey)?.delete(key);
  }

  cancelScheme(schemeKey: string) {
    for (const [key, job] of this.queued) {
      if (job.schemeKey !== schemeKey) continue;
      job.discard?.();
      this.queued.delete(key);
    }
    this.versions.delete(schemeKey);
    if (this.priorityScheme === schemeKey) this.priorityScheme = null;
    this.notifyIdle();
  }

  /** Resolves when nothing is queued or running. */
  idle(): Promise<void> {
    if (this.pendingCount === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
    });
  }

  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    this.scheduleFn(() => {
      this.scheduled = false;
      this.pump();
    });
  }

  private take(): IQueuedJob | null {
    let chosenKey: string | null = null;
    for (const [key, job] of this.queued) {
      if (this.priorityScheme !== null && job.schemeKey === this.priorityScheme) {
        chosenKey = key;
        break;
      }
      chosenKey ??= key;
      if (this.priorityScheme === null) break;
    }
    if (chosenKey === null) return null;
    const job = this.queued.get(chosenKey) ?? null;
    this.queued.delete(chosenKey);
    return job;
  }

  private pump() {
    while (this.running < this.concurrency) {
      const job = this.take();
      if (!job) break;
      void this.run(job);
    }
    this.notifyIdle();
  }

  private async run(job: IQueuedJob) {
    this.running += 1;
    let issues: IValidationIssue[] = [];
    try {
      issues = await job.check();
    } catch (error) {
      console.warn(`[validation] check "${job.source}" on node ${job.nodeId} failed`, error);
    }
    this.running -= 1;
    const key = jobKey(job.schemeKey, job.nodeId, job.source);
    if (this.versions.get(job.schemeKey)?.get(key) === job.version) {
      try {
        job.apply(issues);
      } catch (error) {
        console.warn('[validation] applying a result failed', error);
      }
    } else {
      job.discard?.();
    }
    if (this.queued.size > 0) this.schedule();
    this.notifyIdle();
  }

  private notifyIdle() {
    if (this.pendingCount !== 0) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }
}

/** The queue every scheme of the window shares unless a host passes its own. */
export const defaultValidationQueue = new ValidationQueue();

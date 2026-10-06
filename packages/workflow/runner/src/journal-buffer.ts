/* oxlint-disable no-plusplus, no-undefined, no-void, no-await-in-loop, init-declarations, no-nested-ternary, unicorn/no-nested-ternary, parameter-properties, consistent-existence-index-check */
import { buildLostNoticeSourceKey, runJournalEnvFromTaskQueue } from '@falang/workflow-dto';
import type { IJournalSink, IJournalWireEntry } from './journal-types.js';

export const JOURNAL_BUFFER_MAX = 10_000;
export const JOURNAL_BATCH_SIZE = 500;
export const JOURNAL_FLUSH_THRESHOLD = 100;
export const JOURNAL_FLUSH_INTERVAL_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

type TFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number }>;

export interface IJournalBufferOptions {
  readonly backendUrl: string;
  readonly projectId: string;
  readonly projectToken: string;
  readonly env: 'dev' | 'prod';
  readonly buildId?: string | null;
  readonly maxEntries?: number;
  readonly flushIntervalMs?: number;
  readonly fetch?: TFetch;
  readonly onError?: (message: string, error?: unknown) => void;
}

/** `workflow-dev-*` task queues are the dev stand, everything else is prod (contract §5). */
export const envFromTaskQueue = runJournalEnvFromTaskQueue;

/**
 * The pod's in-memory journal queue (ADR 0059 §4). `push` is synchronous and never throws; a background flusher sends
 * batches to `backend`. Bounded: on overflow the oldest entries are dropped and counted per run, and the next
 * successful batch is followed by one "N journal entries lost" warning per affected run.
 */
export class JournalBuffer implements IJournalSink {
  private queue: IJournalWireEntry[] = [];
  private readonly lost = new Map<string, { workflowId: string; runId: string | null; count: number }>();
  private lostSeq = 0;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<boolean> | null = null;
  private failures = 0;
  private disposed = false;
  private readonly maxEntries: number;
  private readonly intervalMs: number;
  private readonly doFetch: TFetch;

  public constructor(private readonly options: IJournalBufferOptions) {
    this.maxEntries = options.maxEntries ?? JOURNAL_BUFFER_MAX;
    this.intervalMs = options.flushIntervalMs ?? JOURNAL_FLUSH_INTERVAL_MS;
    this.doFetch = options.fetch ?? ((url, init) => fetch(url, init));
  }

  public get size(): number {
    return this.queue.length;
  }

  public push(entry: IJournalWireEntry): void {
    if (this.disposed) return;
    try {
      this.queue.push(entry);
      this.trimOverflow();
      if (this.queue.length >= JOURNAL_FLUSH_THRESHOLD) {
        this.schedule(0);
      } else {
        this.schedule(this.intervalMs);
      }
    } catch {
      // The journal never breaks a run.
    }
  }

  /** Sends everything queued, giving up after `timeoutMs` or on the first failed request. */
  public async flush(timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let timeoutTimer: NodeJS.Timeout | null = null;
    const timeout = new Promise<void>((resolve) => {
      timeoutTimer = setTimeout(resolve, timeoutMs);
    });
    const drain = async (): Promise<void> => {
      while (Date.now() <= deadline) {
        if (this.inFlight) {
          await this.inFlight;
          continue;
        }
        if (this.queue.length === 0) return;
        if (!(await this.sendOnce())) return;
      }
    };
    try {
      await Promise.race([drain(), timeout]);
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
    }
  }

  public dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private trimOverflow(): void {
    const excess = this.queue.length - this.maxEntries;
    if (excess <= 0) return;
    const dropped = this.queue.splice(0, excess);
    for (const entry of dropped) {
      const key = `${entry.workflowId}\u0000${entry.runId ?? ''}`;
      const existing = this.lost.get(key);
      if (existing) existing.count++;
      else this.lost.set(key, { workflowId: entry.workflowId, runId: entry.runId, count: 1 });
    }
  }

  private schedule(delayMs: number): void {
    if (this.disposed) return;
    if (this.timer) {
      if (delayMs > 0) return;
      clearTimeout(this.timer);
    }
    const delay = this.failures > 0 ? Math.max(delayMs, this.backoffMs()) : delayMs;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, delay);
    this.timer.unref?.();
  }

  private backoffMs(): number {
    return Math.min(MAX_BACKOFF_MS, this.intervalMs * 2 ** Math.min(this.failures, 10));
  }

  private async tick(): Promise<void> {
    if (!this.inFlight) await this.sendOnce();
    if (this.queue.length > 0) this.schedule(this.queue.length >= JOURNAL_FLUSH_THRESHOLD ? 0 : this.intervalMs);
  }

  /** Sends one batch; resolves `true` on success (or nothing to send). */
  private sendOnce(): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    const run = this.send().finally(() => {
      this.inFlight = null;
    });
    this.inFlight = run;
    return run;
  }

  private async send(): Promise<boolean> {
    if (this.queue.length === 0) return true;
    const batch = this.queue.splice(0, JOURNAL_BATCH_SIZE);
    const url = `${this.options.backendUrl.replace(/\/+$/, '')}/internal/projects/${encodeURIComponent(this.options.projectId)}/run-journal`;
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-project-token': this.options.projectToken },
        body: JSON.stringify({ env: this.options.env, buildId: this.options.buildId ?? null, entries: batch }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`run-journal ingest answered ${response.status}`);
      this.failures = 0;
      this.enqueueLostNotices();
      return true;
    } catch (error) {
      this.failures++;
      this.queue.unshift(...batch);
      this.trimOverflow();
      this.options.onError?.('Run journal flush failed, will retry', error);
      return false;
    } finally {
      clearTimeout(abortTimer);
    }
  }

  private enqueueLostNotices(): void {
    if (this.lost.size === 0) return;
    const ts = Date.now();
    for (const { workflowId, runId, count } of this.lost.values()) {
      this.lostSeq++;
      this.queue.push({
        workflowId,
        runId,
        sourceKey: buildLostNoticeSourceKey(runId ?? workflowId, this.lostSeq),
        kind: 'error',
        level: 'warn',
        message: `${count} journal entries lost`,
        data: { lost: count },
        documentId: null,
        nodeId: null,
        vendor: null,
        ts,
      });
    }
    this.lost.clear();
  }
}

// oxlint-disable no-undefined, no-await-in-loop -- default env source; batches must run sequentially.
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { RUN_JOURNAL_STORE, type IRunJournalStore } from './run-journal-store.js';
import type { TJournalEnv } from './run-journal.types.js';

const SWEEP_INTERVAL_MS = 10 * 60_000;
const BATCH_SIZE = 5000;
/** Safety bound so one sweep can't spin forever on a huge backlog; the next tick continues. */
const MAX_BATCHES_PER_SWEEP = 200;
const DAY_MS = 86_400_000;
const DEFAULT_RETENTION_DAYS = 14;

/** Retention in days for one env from `RUN_JOURNAL_RETENTION_DAYS_DEV`/`_PROD` (default 14; invalid → default). */
export const resolveRetentionDays = (env: TJournalEnv, source: NodeJS.ProcessEnv = process.env): number => {
  const raw = source[env === 'dev' ? 'RUN_JOURNAL_RETENTION_DAYS_DEV' : 'RUN_JOURNAL_RETENTION_DAYS_PROD'];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
};

/** Deletes journal entries past their per-env retention in bounded batches (ADR 0059 (private) §7); same timer shape as `FileGcService`. */
@Injectable()
export class RunJournalGcService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunJournalGcService.name);
  private readonly store: IRunJournalStore;
  private handle: NodeJS.Timeout | undefined;

  constructor(@Inject(RUN_JOURNAL_STORE) store: IRunJournalStore) {
    this.store = store;
  }

  onModuleInit(): void {
    this.handle = setInterval(() => {
      this.sweep().catch((error: unknown) => {
        this.logger.error('Run journal GC sweep failed', error instanceof Error ? error.stack : error);
      });
    }, SWEEP_INTERVAL_MS);
    this.handle.unref();
  }

  async sweep(now: Date = new Date()): Promise<number> {
    let total = 0;
    for (const env of ['dev', 'prod'] as const) {
      const before = new Date(now.getTime() - resolveRetentionDays(env) * DAY_MS);
      for (let batch = 0; batch < MAX_BATCHES_PER_SWEEP; batch += 1) {
        const deleted = await this.store.deleteOlderThan(env, before, BATCH_SIZE);
        total += deleted;
        if (deleted < BATCH_SIZE) break;
      }
    }
    if (total > 0) this.logger.log(`Removed ${total} expired run journal entr${total === 1 ? 'y' : 'ies'}`);
    return total;
  }

  onModuleDestroy(): void {
    if (this.handle) clearInterval(this.handle);
  }
}

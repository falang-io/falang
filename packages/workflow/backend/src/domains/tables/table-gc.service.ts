// oxlint-disable no-await-in-loop, no-undefined -- batches run sequentially; optional env source.
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

const SWEEP_INTERVAL_MS = 10 * 60_000;
const BATCH_SIZE = 5000;
const MAX_BATCHES_PER_SWEEP = 100;
const DAY_MS = 86_400_000;
const DEFAULT_RETENTION_DAYS = 30;

/** Retention of `table_record_changes` in days (`TABLE_CHANGES_RETENTION_DAYS`, default 30; invalid -> default). */
export const resolveChangesRetentionDays = (source: NodeJS.ProcessEnv = process.env): number => {
  const raw = source['TABLE_CHANGES_RETENTION_DAYS'];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
};

/** Deletes change-log rows past their retention in bounded batches; same timer shape as `RunJournalGcService`. */
@Injectable()
export class TableGcService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TableGcService.name);
  private readonly ds: DataSource;
  private handle: NodeJS.Timeout | undefined;

  constructor(@InjectDataSource() ds: DataSource) {
    this.ds = ds;
  }

  onModuleInit(): void {
    this.handle = setInterval(() => {
      this.sweep().catch((error: unknown) => {
        this.logger.error('Table change-log GC sweep failed', error instanceof Error ? error.stack : error);
      });
    }, SWEEP_INTERVAL_MS);
    this.handle.unref();
  }

  onModuleDestroy(): void {
    if (this.handle) clearInterval(this.handle);
  }

  async sweep(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - resolveChangesRetentionDays() * DAY_MS).toISOString();
    let total = 0;
    for (let batch = 0; batch < MAX_BATCHES_PER_SWEEP; batch += 1) {
      const raw: unknown = await this.ds.query(
        'DELETE FROM table_record_changes WHERE id IN (SELECT id FROM table_record_changes WHERE created_at < $1::timestamp ORDER BY id LIMIT $2) RETURNING id',
        [cutoff, BATCH_SIZE],
      );
      const rows = Array.isArray(raw) && Array.isArray(raw[0]) ? (raw[0] as unknown[]) : (raw as unknown[]);
      total += rows.length;
      if (rows.length < BATCH_SIZE) break;
    }
    if (total > 0) this.logger.log(`Removed ${total} expired table change row${total === 1 ? '' : 's'}`);
    return total;
  }
}

// oxlint-disable no-await-in-loop -- changes are delivered in order, one at a time.
import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { IntegrationsRuntimeService } from '@falang/workflow-gateway';
import type { TTableDispatchStatus } from '@falang/workflow-dto';
import { TABLES_VENDOR } from '@falang/workflow-integrations-tables';
import { DataSource } from 'typeorm';
import { RunJournalService } from '../run-journal/run-journal.service.js';
import {
  buildWirePayload,
  TRIGGER_NAME_BY_OP,
  type IChangeOutboxStore,
  type IChangeRow,
} from './table-change-dispatch.js';
import { DocumentTableTriggerFinder, type ITableTriggerFinder } from './document-table-trigger-finder.js';
import { PgChangeOutboxStore } from './pg-change-outbox-store.js';

const TICK_MS = 1000;
const BATCH_SIZE = 100;
const WINDOW_MS = 60_000;
const MAX_FAILURES = 20;
/** Every N-th tick also looks for stale claims left by a crashed tick. */
const RECLAIM_EVERY_TICKS = 30;
const DEFAULT_MAX_PER_MINUTE = 600;
const DEFAULT_MAX_AGE_SECONDS = 600;

export const TABLE_CHANGE_OUTBOX_STORE = Symbol('TABLE_CHANGE_OUTBOX_STORE');
export const TABLE_TRIGGER_FINDER = Symbol('TABLE_TRIGGER_FINDER');
export const TABLE_TRIGGER_SIGNALLER = Symbol('TABLE_TRIGGER_SIGNALLER');
export const TABLE_DISPATCHER_CONFIG = Symbol('TABLE_DISPATCHER_CONFIG');

export interface ITableTriggerSignaller {
  signal(
    projectId: string,
    env: 'dev' | 'prod',
    signal: { workflowId: string; workflowType: string; signalName: string; signalArgs: readonly unknown[] },
  ): Promise<'delivered' | 'inactive'>;
}

export interface IChangeDispatcherJournal {
  recordProblem(params: {
    projectId: string;
    env: 'dev' | 'prod';
    workflowId: string;
    vendor: string;
    level: 'warn';
    message: string;
    data: Record<string, unknown>;
  }): Promise<void>;
}

export interface IChangeDispatcherConfig {
  readonly maxPerMinute: number;
  readonly maxAgeMs: number;
}

const positive = (raw: string | undefined, fallback: number): number => {
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** `TABLE_TRIGGER_MAX_PER_MINUTE` (600) and `TABLE_TRIGGER_MAX_AGE_SECONDS` (600). */
export const resolveDispatcherConfig = (source: NodeJS.ProcessEnv = process.env): IChangeDispatcherConfig => ({
  maxPerMinute: positive(source.TABLE_TRIGGER_MAX_PER_MINUTE, DEFAULT_MAX_PER_MINUTE),
  maxAgeMs: positive(source.TABLE_TRIGGER_MAX_AGE_SECONDS, DEFAULT_MAX_AGE_SECONDS) * 1000,
});

/** The 1 s timer is off under Vitest (tests call `tick()`) and with `TABLE_TRIGGER_DISPATCH=off`. */
const isTimerDisabled = (source: NodeJS.ProcessEnv = process.env): boolean =>
  source.TABLE_TRIGGER_DISPATCH === 'off' || Boolean(source.VITEST);

type TDispatchOutcome = Extract<TTableDispatchStatus, 'delivered' | 'no_target' | 'throttled' | 'expired' | 'error'>;

const SIGNAL_NAME_BY_OP: Readonly<Record<IChangeRow['op'], string>> = {
  created: 'tableRecordCreated',
  updated: 'tableRecordUpdated',
  deleted: 'tableRecordDeleted',
};

/**
 * Transactional-outbox dispatcher of project table record triggers (ADR 0075 (private) decision 4): reads the
 * `table_record_changes` rows the write paths inserted in their own transaction (workflow/agent/mcp sources only) and
 * signals the trigger-functions bound to the table through the project's implicit `tables` target. One workflow per
 * change (`table-<triggerDocId>-<changeId>`), so a burst of events never overwrites a running trigger's payload.
 */
@Injectable()
export class TableChangeDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TableChangeDispatcherService.name);
  private readonly store: IChangeOutboxStore;
  private readonly finder: ITableTriggerFinder;
  private readonly signaller: ITableTriggerSignaller;
  private readonly journal: IChangeDispatcherJournal;
  private readonly config: IChangeDispatcherConfig;
  private handle: NodeJS.Timeout | undefined;
  private running = false;
  private ticks = 0;
  private readonly failures = new Map<number, number>();
  private readonly lastThrottleJournal = new Map<string, number>();

  constructor(
    @Inject(TABLE_CHANGE_OUTBOX_STORE) store: IChangeOutboxStore,
    @Inject(TABLE_TRIGGER_FINDER) finder: ITableTriggerFinder,
    @Inject(TABLE_TRIGGER_SIGNALLER) signaller: ITableTriggerSignaller,
    @Inject(RunJournalService) journal: IChangeDispatcherJournal,
    @Optional() @Inject(TABLE_DISPATCHER_CONFIG) config?: IChangeDispatcherConfig,
  ) {
    this.store = store;
    this.finder = finder;
    this.signaller = signaller;
    this.journal = journal;
    this.config = config ?? resolveDispatcherConfig();
  }

  onModuleInit(): void {
    if (isTimerDisabled()) return;
    this.handle = setInterval(() => {
      this.tick().catch((error: unknown) => {
        this.logger.error('Table change dispatch failed', error instanceof Error ? error.stack : error);
      });
    }, TICK_MS);
    this.handle.unref();
  }

  onModuleDestroy(): void {
    if (this.handle) clearInterval(this.handle);
  }

  /** One pass over the pending changes. Guarded against overlap; returns how many rows were resolved. */
  async tick(now: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      this.ticks += 1;
      const rows = await this.store.claim(BATCH_SIZE, now, this.ticks % RECLAIM_EVERY_TICKS === 0);
      if (rows.length === 0) return 0;
      const createdAt = await this.store.recordCreatedAt([...new Set(rows.map((row) => row.recordId))]);
      const deliveredInWindow = new Map<string, number>();
      const windowStart = new Date(now.getTime() - WINDOW_MS);
      let resolved = 0;
      for (const row of rows) {
        const status = await this.processRow(row, now, createdAt.get(row.recordId), deliveredInWindow, windowStart);
        if (status) resolved += 1;
      }
      return resolved;
    } finally {
      this.running = false;
    }
  }

  /** Delivers one claimed row, then records its outcome (or releases it for a retry). */
  private async processRow(
    row: IChangeRow,
    now: Date,
    recordCreatedAt: Date | undefined,
    deliveredInWindow: Map<string, number>,
    windowStart: Date,
  ): Promise<TDispatchOutcome | null> {
    const key = `${row.tableId}:${row.env}`;
    const status = await this.dispatchOne(row, now, recordCreatedAt, async () => {
      if (!deliveredInWindow.has(key)) {
        deliveredInWindow.set(key, await this.store.countDelivered(row.tableId, row.env, windowStart));
      }
      return deliveredInWindow.get(key) ?? 0;
    });
    if (!status) {
      await this.store.release(row.id);
      return null;
    }
    if (status === 'delivered') deliveredInWindow.set(key, (deliveredInWindow.get(key) ?? 0) + 1);
    await this.store.mark(row.id, status, now);
    this.failures.delete(row.id);
    return status;
  }

  /** The final status of one change, or `null` to leave it pending (retried next tick). */
  private async dispatchOne(
    row: IChangeRow,
    now: Date,
    recordCreatedAt: Date | undefined,
    deliveredInWindow: () => Promise<number>,
  ): Promise<TDispatchOutcome | null> {
    try {
      const targets = await this.finder.find(row.projectId, row.tableId, TRIGGER_NAME_BY_OP[row.op]);
      if (targets.length === 0) return 'no_target';

      if ((await deliveredInWindow()) >= this.config.maxPerMinute) {
        await this.journalThrottled(row, now);
        return 'throttled';
      }

      const wire = buildWirePayload(row, recordCreatedAt);
      for (const target of targets) {
        const outcome = await this.signaller.signal(row.projectId, row.env, {
          workflowId: `table-${target.documentId}-${row.id}`,
          workflowType: target.name,
          signalName: SIGNAL_NAME_BY_OP[row.op],
          signalArgs: [wire],
        });
        if (outcome === 'inactive') {
          return now.getTime() - row.createdAt.getTime() > this.config.maxAgeMs ? 'expired' : null;
        }
      }
      return 'delivered';
    } catch (error) {
      const count = (this.failures.get(row.id) ?? 0) + 1;
      this.failures.set(row.id, count);
      this.logger.error(
        `Dispatching table change ${row.id} failed (${count}/${MAX_FAILURES})`,
        error instanceof Error ? error.stack : error,
      );
      return count >= MAX_FAILURES ? 'error' : null;
    }
  }

  /** At most one journal entry per (table, env) per minute. */
  private async journalThrottled(row: IChangeRow, now: Date): Promise<void> {
    const key = `${row.tableId}:${row.env}`;
    const last = this.lastThrottleJournal.get(key);
    if (typeof last === 'number' && now.getTime() - last < WINDOW_MS) return;
    this.lastThrottleJournal.set(key, now.getTime());
    try {
      await this.journal.recordProblem({
        projectId: row.projectId,
        env: row.env,
        workflowId: `tables:${row.tableId}`,
        vendor: TABLES_VENDOR,
        level: 'warn',
        message: `Table triggers throttled: more than ${this.config.maxPerMinute} events per minute`,
        data: { tableId: row.tableId },
      });
    } catch (error) {
      this.logger.error('Failed to journal a throttled table trigger', error instanceof Error ? error.stack : error);
    }
  }
}

/** Default providers: the Postgres outbox, the document-based finder and the gateway-backed signaller. */
export const tableChangeDispatcherProviders = [
  DocumentTableTriggerFinder,
  {
    provide: TABLE_TRIGGER_FINDER,
    useExisting: DocumentTableTriggerFinder,
  },
  {
    provide: TABLE_CHANGE_OUTBOX_STORE,
    useFactory: (dataSource: DataSource): IChangeOutboxStore => new PgChangeOutboxStore(dataSource),
    inject: [DataSource],
  },
  {
    provide: TABLE_TRIGGER_SIGNALLER,
    useFactory: (runtime: IntegrationsRuntimeService): ITableTriggerSignaller => ({
      signal: (projectId, env, signal) => runtime.signalTarget(TABLES_VENDOR, projectId, env, signal),
    }),
    inject: [IntegrationsRuntimeService],
  },
  TableChangeDispatcherService,
];

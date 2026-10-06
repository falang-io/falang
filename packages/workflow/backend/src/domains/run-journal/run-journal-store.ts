import type { IRunJournalListOptions, IRunJournalPage, IRunJournalRow, TJournalEnv } from './run-journal.types.js';

/** DI token for the journal storage seam (ADR 0059 (private) §3) — a second implementation (ClickHouse/Loki/S3) replaces `PgRunJournalStore` only. */
export const RUN_JOURNAL_STORE = Symbol('RUN_JOURNAL_STORE');

export interface IRunJournalStore {
  /** Idempotent: a row whose `(workflowId, sourceKey)` already exists is skipped silently. */
  append(rows: readonly IRunJournalRow[]): Promise<void>;
  listRun(
    projectId: string,
    workflowId: string,
    runId: string,
    options: IRunJournalListOptions,
  ): Promise<IRunJournalPage>;
  /** All runs of one workflow id plus its `runId = null` entries. */
  listWorkflow(projectId: string, workflowId: string, options: IRunJournalListOptions): Promise<IRunJournalPage>;
  /** Deletes at most `batchSize` entries of `env` older than `before`; returns how many were deleted. */
  deleteOlderThan(env: TJournalEnv, before: Date, batchSize: number): Promise<number>;
  deleteProject(projectId: string): Promise<void>;
}

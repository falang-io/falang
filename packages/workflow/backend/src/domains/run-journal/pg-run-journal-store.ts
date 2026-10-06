// oxlint-disable no-undefined, unicorn/no-array-callback-reference -- optional cursor; `toDto` is a plain mapper.
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';
import { RunJournalEntry } from './run-journal-entry.entity.js';
import type { IRunJournalStore } from './run-journal-store.js';
import type {
  IRunJournalEntryDto,
  IRunJournalListOptions,
  IRunJournalPage,
  IRunJournalRow,
  TJournalEnv,
} from './run-journal.types.js';

const toDto = (row: RunJournalEntry): IRunJournalEntryDto => ({
  id: String(row.id),
  workflowId: row.workflowId,
  runId: row.runId,
  env: row.env,
  kind: row.kind,
  level: row.level,
  message: row.message,
  data: row.data,
  documentId: row.documentId,
  nodeId: row.nodeId,
  vendor: row.vendor,
  truncated: row.truncated,
  textsStripped: row.textsStripped,
  ts: new Date(row.ts).toISOString(),
});

/** TypeORM-backed `IRunJournalStore` — Postgres in production, the in-memory sqlite harness in tests. */
@Injectable()
export class PgRunJournalStore implements IRunJournalStore {
  private readonly entries: Repository<RunJournalEntry>;

  constructor(@InjectRepository(RunJournalEntry) entries: Repository<RunJournalEntry>) {
    this.entries = entries;
  }

  async append(rows: readonly IRunJournalRow[]): Promise<void> {
    if (rows.length === 0) return;
    // `orIgnore()` = `ON CONFLICT DO NOTHING` (Postgres) / `INSERT OR IGNORE` (sqlite): a retried batch never duplicates.
    await this.entries
      .createQueryBuilder()
      .insert()
      .into(RunJournalEntry)
      .values(rows.map((row) => ({ ...row })) as QueryDeepPartialEntity<RunJournalEntry>[])
      .orIgnore()
      .execute();
  }

  listRun(
    projectId: string,
    workflowId: string,
    runId: string,
    options: IRunJournalListOptions,
  ): Promise<IRunJournalPage> {
    return this.list({ projectId, workflowId, runId }, options);
  }

  listWorkflow(projectId: string, workflowId: string, options: IRunJournalListOptions): Promise<IRunJournalPage> {
    return this.list({ projectId, workflowId }, options);
  }

  private async list(
    scope: { projectId: string; workflowId: string; runId?: string },
    options: IRunJournalListOptions,
  ): Promise<IRunJournalPage> {
    const query = this.entries
      .createQueryBuilder('e')
      .where('e.project_id = :projectId', { projectId: scope.projectId })
      .andWhere('e.workflow_id = :workflowId', { workflowId: scope.workflowId });
    if (scope.runId !== undefined) query.andWhere('e.run_id = :runId', { runId: scope.runId });
    if (options.after !== undefined && options.after !== '') query.andWhere('e.id > :after', { after: options.after });
    const rows = await query
      // `id` (insertion order) is the cursor order; clients sort for display by (ts, id).
      .orderBy('e.id', 'ASC')
      .take(options.limit + 1)
      .getMany();
    const hasMore = rows.length > options.limit;
    const entries = rows.slice(0, options.limit).map(toDto);
    return { entries, hasMore };
  }

  async deleteOlderThan(env: TJournalEnv, before: Date, batchSize: number): Promise<number> {
    const rows = await this.entries
      .createQueryBuilder('e')
      .select('e.id', 'id')
      .where('e.env = :env', { env })
      .andWhere('e.ts < :before', { before })
      .orderBy('e.id', 'ASC')
      .limit(batchSize)
      .getRawMany<{ id: number | string }>();
    if (rows.length === 0) return 0;
    await this.entries.delete({ id: In(rows.map((row) => row.id)) });
    return rows.length;
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.entries.delete({ projectId });
  }
}

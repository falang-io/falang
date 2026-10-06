import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { TJournalEnv, TJournalKind, TJournalLevel } from './run-journal.types.js';

/**
 * One row of a run's journal (ADR 0059 (private) §3). No foreign keys (like `agent_usage`), so deleting a
 * project is one `DELETE … WHERE project_id`. `id` is `bigserial` in Postgres (the migration), an integer
 * in the sqlite test harness — always handled as a string outside the store. `data` is `jsonb` (same
 * reasoning as `IntegrationVendorData`), `ts` a plain `Date` (not `timestamptz`, unsupported by sqlite).
 */
@Entity('run_journal_entries')
@Unique('UQ_run_journal_workflow_source', ['workflowId', 'sourceKey'])
@Index('IDX_run_journal_run', ['projectId', 'workflowId', 'runId', 'ts'])
@Index('IDX_run_journal_env_ts', ['projectId', 'env', 'ts'])
@Index('IDX_run_journal_gc', ['env', 'ts'])
export class RunJournalEntry {
  @PrimaryGeneratedColumn('increment')
  id!: number | string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'varchar' })
  env!: TJournalEnv;

  @Column({ name: 'build_id', type: 'varchar', nullable: true })
  buildId!: string | null;

  @Column({ name: 'workflow_id', type: 'varchar' })
  workflowId!: string;

  @Column({ name: 'run_id', type: 'varchar', nullable: true })
  runId!: string | null;

  @Column({ name: 'document_id', type: 'varchar', nullable: true })
  documentId!: string | null;

  @Column({ name: 'node_id', type: 'varchar', nullable: true })
  nodeId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  vendor!: string | null;

  @Column({ type: 'varchar' })
  kind!: TJournalKind;

  @Column({ type: 'varchar' })
  level!: TJournalLevel;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'jsonb', nullable: true })
  data!: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  truncated!: boolean;

  @Column({ name: 'texts_stripped', type: 'boolean', default: false })
  textsStripped!: boolean;

  @Column({ type: Date })
  ts!: Date;

  @Column({ name: 'source_key', type: 'varchar' })
  sourceKey!: string;
}

import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Append-only change log of a project table (ADR 0075 (private)): record history and the transactional outbox for
 * record triggers. `record_id` has no FK, so the history outlives a deleted record. Partial/unique indexes live in the
 * migration only.
 */
@Entity('table_record_changes')
export class TableRecordChange {
  /** Dispatch order. */
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'table_id', type: 'uuid' })
  tableId!: string;

  @Column({ type: 'varchar' })
  env!: string;

  @Column({ name: 'record_id', type: 'uuid' })
  recordId!: string;

  /** `created` | `updated` | `deleted`. */
  @Column({ type: 'varchar' })
  op!: string;

  @Column({ type: 'jsonb', nullable: true })
  before!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after!: Record<string, unknown> | null;

  /** Field ids that changed. */
  @Column({ name: 'changed_fields', type: 'jsonb', nullable: true })
  changedFields!: string[] | null;

  /** `workflow` | `grid` | `import` | `agent` | `mcp` | `copy` | `clear`. */
  @Column({ type: 'varchar' })
  source!: string;

  @Column({ name: 'run_id', type: 'varchar', nullable: true })
  runId!: string | null;

  @Column({ name: 'workflow_id', type: 'varchar', nullable: true })
  workflowId!: string | null;

  /** The record's version after the change (for `deleted`: the deleted record's version); null on old rows. */
  @Column({ name: 'record_version', type: 'integer', nullable: true })
  recordVersion!: number | null;

  /** The record's creation time; null on old rows. */
  @Column({ name: 'record_created_at', type: Date, nullable: true })
  recordCreatedAt!: Date | null;

  @Column({ name: 'created_at', type: Date, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ name: 'dispatched_at', type: Date, nullable: true })
  dispatchedAt!: Date | null;

  /** `delivered` | `throttled` | `no_target` | `expired` | `error`. */
  @Column({ name: 'dispatch_status', type: 'varchar', nullable: true })
  dispatchStatus!: string | null;
}

import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * One record of a project table (ADR 0075 (private)): the generic `table_records` relation, `data` keyed by stable
 * field ids (`f1`, `f2`, …). `table_id` is the id of the `table` document (FK cascade in the migration); `env` keeps
 * dev and prod data apart. The GIN index on `data` lives in the migration only (not valid in the sqlite test harness).
 */
@Entity('table_records')
export class TableRecord {
  /** Minted by the backend (`randomUUID`), never DB-generated. */
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'table_id', type: 'uuid' })
  tableId!: string;

  /** `'dev'` | `'prod'`. */
  @Column({ type: 'varchar' })
  env!: string;

  @Column({ type: 'jsonb' })
  data!: Record<string, unknown>;

  /** Optimistic-locking counter, incremented on every update. */
  @Column({ type: 'int', default: 1 })
  version!: number;

  /** `<runId>:<activityId>` of the workflow insert that created the record — makes Temporal retries idempotent. */
  @Column({ name: 'idempotency_key', type: 'varchar', nullable: true })
  idempotencyKey!: string | null;

  @Column({ name: 'created_at', type: Date, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: Date, default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}

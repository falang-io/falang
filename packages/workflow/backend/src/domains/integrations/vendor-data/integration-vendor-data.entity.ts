import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Project } from '../../projects/projects/project.entity.js';

/**
 * Backend-written, non-secret data about a configured `integrations`-document instance — e.g. a
 * database credential's synced table/column schema — kept in its own table rather than as a field
 * on `IIntegrationInstance`, so the `integrations` document (loaded whole by several paths) stays
 * small and the secret codec never has to know about it. See
 * ADR 0039 (private) §4's "Decisions (2026-09-28)" #2.
 *
 * `key` namespaces what's stored per instance (`'schema'` for the SQL vendors' synced structure
 * today, room for more later — e.g. a future vendor's own discovered metadata). Composite PK
 * `(project_id, instance_id, key)`: one row per (instance, kind of data), no separate id needed.
 *
 * Deliberately **not** covered by project export/import or versioning (ADR 0025 (private)) — an
 * imported/restored project shows its DB instances as "not synced" until "Sync structure" runs
 * again; the data is fully re-derivable from the live source, so this is an accepted gap, not a bug.
 *
 * `data` is `jsonb` (not `simple-json`/`text` like `Document.root`/`data`) — verified against this
 * repo's own in-memory `better-sqlite3` e2e test harness (`test-utils/e2e-app.ts`) that TypeORM's
 * `jsonb` column type round-trips fine there (its `supportedDataTypes` list includes `json`/`jsonb`,
 * serialized via `JSON.stringify`/`JSON.parse` same as `simple-json`) — unlike `timestamptz` below.
 */
@Entity('integration_vendor_data')
export class IntegrationVendorData {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @PrimaryColumn({ name: 'instance_id', type: 'varchar' })
  instanceId!: string;

  @PrimaryColumn({ type: 'varchar' })
  key!: string;

  @Column({ type: 'varchar' })
  vendor!: string;

  @Column({ type: 'jsonb' })
  data!: Record<string, unknown>;

  // Plain `Date` (→ Postgres `TIMESTAMP`), not `timestamptz` — matching every other timestamp
  // column in this schema (see `1789555100000-DocumentLocks.ts`'s own comment on this) and, unlike
  // `timestamptz`, actually supported by the `better-sqlite3` test harness (confirmed empirically —
  // `better-sqlite3`'s TypeORM driver has no `timestamptz` in its `supportedDataTypes`, so an entity
  // column typed that way fails `synchronize` there, even though real Postgres accepts it fine).
  @UpdateDateColumn({ name: 'updated_at', type: Date })
  updatedAt!: Date;
}

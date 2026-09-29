import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { ValueTransformer } from 'typeorm';
import { Project } from '../projects/projects/project.entity.js';

/**
 * Postgres' `pg` driver returns `bigint` columns as strings — see `UserLimits`' own identical
 * transformer for why round-tripping through `Number` is safe for byte counts in this range.
 */
const bigintTransformer: ValueTransformer = {
  from: (value: string | number | null): number | null => (value === null ? null : Number(value)),
  to: (value: number | null | undefined): number | null | undefined => value,
};

/**
 * Metadata for one object in the platform's S3-compatible bucket (`storage_key`, `<projectId>/<id>`) —
 * see ADR 0038 (private) §2. The bytes themselves never touch Postgres;
 * this row is what backs quota accounting, the TTL sweep (`FileGcService`), and the project's own
 * "Files" tab. `id` is a 22-character base64url string (`generateFileId()`, `crypto.randomBytes(16)`),
 * not a uuid — unguessable but, per the ADR, *not* itself a capability: reaching a file's bytes still
 * needs either the owning project's JWT/internal token, or a separately-minted `public_token`.
 */
@Entity('files')
export class File {
  @PrimaryColumn({ type: 'varchar', length: 22 })
  id!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  size!: number;

  @Column({ type: 'varchar' })
  mime!: string;

  /** `<projectId>/<id>` — the S3 object key, kept as its own column rather than derived, so the storage layout can change without a migration touching every row. */
  @Column({ name: 'storage_key', type: 'varchar' })
  storageKey!: string;

  /** `'run:<workflowId>'` | `'ingress:telegram'` | `'user:<userId>'` — see the ADR's §2/§4. Free-form on purpose; nothing parses it besides the TTL rule's `startsWith('run:')`/`=== 'ingress:telegram'` checks. */
  @Column({ name: 'created_by', type: 'varchar' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;

  /** `null` = never expires. Set at upload time by the TTL rule (§2) and swept by `FileGcService`. */
  @Column({ name: 'expires_at', type: Date, nullable: true })
  expiresAt!: Date | null;

  /** Unguessable (32 random bytes, base64url) — minted by `files-publish`, cleared by `files-unpublish`. `null` = not published. See the ADR's §1 ("public access is opt-in per file"). */
  @Column({ name: 'public_token', type: 'varchar', nullable: true, unique: true })
  publicToken!: string | null;
}

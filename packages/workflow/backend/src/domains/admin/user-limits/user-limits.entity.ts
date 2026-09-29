import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { ValueTransformer } from 'typeorm';

/**
 * Postgres' `pg` driver returns `bigint` columns as strings (avoiding silent precision loss for
 * values beyond `Number.MAX_SAFE_INTEGER`) — every value this table actually stores (byte counts
 * up to a few GiB) is well within safe-integer range, so round-tripping through `Number` here is
 * safe and keeps `IUserLimits`/`UserLimits` typed as plain numbers everywhere else.
 */
const bigintTransformer: ValueTransformer = {
  from: (value: string | number | null): number | null => (value === null ? null : Number(value)),
  to: (value: number | null | undefined): number | null | undefined => value,
};

/**
 * Per-user overrides of the env-level file/quota defaults (`UserLimitsService`) — see
 * ADR 0038 (private) §2. Every column besides `userId` is nullable:
 * an absent value means "use the env default", not zero. One row per user with at least one
 * override; a user with none has no row at all.
 */
@Entity('user_limits')
export class UserLimits {
  // `type` is explicit on every column below (not left to reflection) — see `User`'s entity for why.
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'max_project_files_bytes', type: 'bigint', nullable: true, transformer: bigintTransformer })
  maxProjectFilesBytes!: number | null;

  @Column({ name: 'max_file_bytes', type: 'bigint', nullable: true, transformer: bigintTransformer })
  maxFileBytes!: number | null;

  @Column({ name: 'dev_file_ttl_hours', type: 'int', nullable: true })
  devFileTtlHours!: number | null;

  @Column({ name: 'ingress_file_ttl_hours', type: 'int', nullable: true })
  ingressFileTtlHours!: number | null;

  @Column({ name: 'max_concurrent_prod_versions', type: 'int', nullable: true })
  maxConcurrentProdVersions!: number | null;

  @UpdateDateColumn({ name: 'updated_at', type: Date })
  updatedAt!: Date;
}

import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Project } from '../../projects/projects/project.entity.js';
import { User } from '../../users/users/user.entity.js';

/**
 * See ADR 0029 (private)'s "Decisions after discussion" §6 (PAT-only auth
 * for the future `/mcp` endpoint, phase F) — this table itself is phase C's own deliverable. A row
 * holds only `token_hash` (sha-256 of the raw `flg_pat_…` token, see `personal-access-tokens.service.ts`),
 * never the raw token itself, which is returned to the caller exactly once at creation time.
 */
@Entity('personal_access_tokens')
export class PersonalAccessToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // `type` is explicit on every column below (not left to reflection) — this app runs via `tsx`,
  // which doesn't emit property-level `design:type` metadata, see `User`'s entity for the full story.
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ name: 'token_hash', type: 'varchar', unique: true })
  tokenHash!: string;

  /** Optional scope: when set, `PatOrJwtAuthGuard.assertProjectScope` rejects use against any other project. */
  @ManyToOne(() => Project, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project | null;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId!: string | null;

  @Column({ name: 'expires_at', type: Date, nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'last_used_at', type: Date, nullable: true })
  lastUsedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;

  @Column({ name: 'revoked_at', type: Date, nullable: true })
  revokedAt!: Date | null;
}

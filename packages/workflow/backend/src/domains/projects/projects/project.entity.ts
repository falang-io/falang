import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/users/user.entity.js';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // `type` is explicit on every column below (not left to reflection) — see `User`'s entity for why.
  @Column({ type: 'varchar' })
  name!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner!: User;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  // `Date` (a JS constructor, not a driver-specific type string) — see `User`'s entity for why.
  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;

  /**
   * The timestamp of the project's most recent mutating write to its documents/folders — see
   * ADR 0025 (private)'s "Correction to decision 2 (2026-09-18)". Read/written
   * by `VersioningService.autoVersionBeforeEdit`/`markEdited` via `SessionGapAutoVersionInterceptor`,
   * never by any other code path. `null` until the project's first mutating write.
   */
  @Column({ name: 'last_edited_at', type: Date, nullable: true })
  lastEditedAt!: Date | null;
}

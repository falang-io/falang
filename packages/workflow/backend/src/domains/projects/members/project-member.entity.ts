import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { User } from '../../users/users/user.entity.js';
import { Project } from '../projects/project.entity.js';

/** A project member's role (ADR 0070 (private)): `editor` can do everything the owner can except delete the project; `executor` only sees and resolves the project's tasks. */
export type TProjectMemberRole = 'editor' | 'executor';

export const PROJECT_MEMBER_ROLES: readonly TProjectMemberRole[] = ['editor', 'executor'];

/**
 * One role of one user in one project — a user holding both roles has two rows. The owner (`projects.owner_id`) is
 * never a member row.
 */
@Entity('project_members')
@Unique(['projectId', 'userId', 'role'])
export class ProjectMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: TProjectMemberRole;

  /** Who added the row (owner, editor or admin) — `null` if that user was deleted. */
  @Column({ name: 'added_by', type: 'uuid', nullable: true })
  addedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;
}

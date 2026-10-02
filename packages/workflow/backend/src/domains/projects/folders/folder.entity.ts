import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Project } from '../projects/project.entity.js';

// At most one section folder per kind per project (ADR 0055 (private)); a partial index, valid in Postgres and sqlite.
@Index('IDX_folders_project_fixed_kind', ['projectId', 'fixedKind'], {
  unique: true,
  where: '"fixed_kind" IS NOT NULL',
})
@Entity('folders')
export class Folder {
  /** Client-supplied (not DB-generated) so the editor can create folders instantly, locally, before the request round-trips. */
  @PrimaryColumn('uuid')
  id!: string;

  // `type` is explicit on every column below (not left to reflection) — see `User`'s entity for why.
  @Column({ type: 'varchar' })
  name!: string;

  @ManyToOne(() => Folder, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_id' })
  parent!: Folder | null;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  /**
   * Set only on a workflow project's fixed root section folders (`'triggers' | 'functions' | 'types'`, see
   * `@falang/workflow-dto`'s `project-layout`); those folders always have `parent_id = null` and can't be
   * renamed, moved or deleted. Every other folder's section is derived by walking `parentId` up.
   */
  @Column({ name: 'fixed_kind', type: 'varchar', nullable: true })
  fixedKind!: string | null;
}

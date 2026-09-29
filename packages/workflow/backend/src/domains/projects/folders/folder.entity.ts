import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Project } from '../projects/project.entity.js';

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
}

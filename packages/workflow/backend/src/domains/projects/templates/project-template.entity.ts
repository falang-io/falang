import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { IProjectExportPayload } from '../export/project-export.service.js';

/** An admin-managed starting point for "New project". See `ProjectTemplatesService`. */
@Entity('project_templates')
export class ProjectTemplate {
  // `type` is explicit on every column (the app runs under `tsx`, no design:type metadata).
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  /** A project export (secrets already blanked); `simple-json` like `Document.root`/`data`. */
  @Column({ type: 'simple-json' })
  payload!: IProjectExportPayload;

  @Column({ name: 'source_project_id', type: 'uuid', nullable: true })
  sourceProjectId!: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: Date })
  updatedAt!: Date;
}

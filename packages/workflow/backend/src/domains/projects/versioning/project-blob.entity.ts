import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Project } from '../projects/project.entity.js';

/**
 * Content-addressed document content, scoped per project (not globally deduplicated — cross-project
 * dedupe isn't worth a garbage collector, and scoping per project means deleting a project cascades
 * its blobs for free). `hash` is the `sha256` hex digest of `canonicalStringify({ root, data })` for
 * one document (`@falang/versioning`'s `canonicalStringify`, hashed with `node:crypto` here — see
 * ADR 0025 (private)). `content` is that same canonical JSON string, so a read
 * path only needs `JSON.parse` (canonical key order is irrelevant once parsed back into an object).
 */
@Entity('project_blobs')
export class ProjectBlob {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @PrimaryColumn({ type: 'varchar', length: 64 })
  hash!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ type: 'text' })
  content!: string;
}

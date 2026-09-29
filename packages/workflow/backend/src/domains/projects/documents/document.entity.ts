import type { INode } from '@falang/dto';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Folder } from '../folders/folder.entity.js';
import { Project } from '../projects/project.entity.js';

@Entity('documents')
export class Document {
  /** Client-supplied (not DB-generated) so the editor can create documents instantly, locally, before the request round-trips. */
  @PrimaryColumn('uuid')
  id!: string;

  // `type` is explicit on every column below (not left to reflection) — see `User`'s entity for why.
  @Column({ type: 'varchar' })
  type!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @ManyToOne(() => Folder, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'folder_id' })
  folder!: Folder | null;

  @Column({ name: 'folder_id', type: 'uuid', nullable: true })
  folderId!: string | null;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  /** Singleton project documents (e.g. `integrations`, auto-seeded on project creation) — not deletable or movable, see `DocumentsService`. */
  @Column({ type: 'boolean', default: false })
  pinned!: boolean;

  // `simple-json` (TypeORM serializes to/from a text column) rather than a driver-specific JSON
  // type: nothing here ever queries inside these blobs with SQL, and this keeps the entity
  // portable across the Postgres backend and the sqlite driver the test suite swaps in.

  /** Root node for `scheme`-typed documents (`IDocumentSchemeConfig`) — see `@falang/dto`'s `IProjectDocument`. */
  @Column({ type: 'simple-json', nullable: true })
  root!: INode | null;

  /** Payload for `custom`-typed documents (`IDocumentCustomConfig`) — see `@falang/dto`'s `IProjectDocument`. */
  @Column({ type: 'simple-json', nullable: true })
  data!: unknown | null;

  /**
   * "One source of editing at a time" — see ADR 0029 (private)'s
   * "Document locks" decision. An opaque session/process id (never a user-facing name), paired with
   * `lockExpiresAt` (a TTL, renewed by every tool call touching the document by the same owner — no
   * sweeper needed, an expired lock is just treated as absent everywhere). Set together, cleared
   * together — see `DocumentsService.lockDocument`/`unlockDocument`.
   */
  @Column({ name: 'lock_owner', type: 'varchar', nullable: true })
  lockOwner!: string | null;

  @Column({ name: 'lock_expires_at', type: Date, nullable: true })
  lockExpiresAt!: Date | null;
}

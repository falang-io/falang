import type { IProjectTreeFolder } from '@falang/dto';
import type { TCommitKind } from '@falang/versioning';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Project } from '../projects/project.entity.js';
import { User } from '../../users/users/user.entity.js';

/** One document's entry inside a commit's `tree` — the tree points at content via `blobHash`, never embeds it (see `ProjectBlob`). */
export interface ICommitTreeDocument {
  id: string;
  type: string;
  name: string;
  folderId: string | null;
  pinned: boolean;
  /** `sha256` hex digest of the document's canonical `{ root, data }` content — see `ProjectBlob`. */
  blobHash: string;
}

/** A commit's whole-project tree — folders verbatim (small, never deduplicated) plus one content-addressed entry per document. See ADR 0025 (private), "Persistence in the workflow product". */
export interface ICommitTree {
  folders: IProjectTreeFolder[];
  documents: ICommitTreeDocument[];
}

/**
 * An immutable, whole-project commit — see ADR 0025 (private). `tree` never
 * embeds document content directly (that lives in content-addressed `ProjectBlob` rows, looked up by
 * `ICommitTreeDocument.blobHash`) so a commit that changes one document out of many writes one new
 * blob row, not a copy of every document. `parent_id` is unused by any read path yet (history is
 * linear — `created_at` order is enough) but kept so branching is possible later without a migration.
 */
@Entity('project_commits')
export class ProjectCommit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @ManyToOne(() => ProjectCommit, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent!: ProjectCommit | null;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author!: User;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @Column({ type: 'varchar' })
  kind!: TCommitKind;

  @Column({ type: 'text' })
  message!: string;

  // `simple-json` (TypeORM serializes to/from a text column), matching `Document.root`/`.data` —
  // nothing here ever queries inside this blob with SQL, and it keeps the entity portable across
  // the Postgres backend and the sqlite driver the test suite swaps in.
  @Column({ type: 'simple-json' })
  tree!: ICommitTree;

  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;
}

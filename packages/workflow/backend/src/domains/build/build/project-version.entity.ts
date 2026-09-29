import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A published (prod) version of a project — see ADR 0004 (private).
 * `workflowBundle`/`activitiesSource` are immutable once written (unlike dev's build output, which
 * is overwritten in place), so rollback (`BuildService.activate`) can respawn a past version's
 * runner pod without recompiling — see ADR 0016 (private)'s "Artifact
 * delivery into the runner pod": the runner pod fetches these over HTTP and loads them in memory
 * (`workflowBundle` straight into `Worker.create({ workflowBundle: { code } })`, `activitiesSource`
 * via a `Module`-based in-memory loader), never touching its own filesystem. Stored here (not just
 * kept in memory the way dev builds are, see `DevArtifactStore`) so a published version's artifact
 * survives a `backend` restart — its runner pod may already be running from before that restart.
 */
@Entity('project_versions')
export class ProjectVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'version_number', type: 'int' })
  versionNumber!: number;

  /** Worker Deployment build ID for this version — always `v<versionNumber>`. */
  @Column({ name: 'build_id', type: 'varchar' })
  buildId!: string;

  /** Pre-bundled workflow code (`@temporalio/worker`'s `bundleWorkflowCode()` output) — see `bundle-workflow-code.ts`. */
  @Column({ name: 'workflow_bundle', type: 'text' })
  workflowBundle!: string;

  /** Compiled Activity implementations, transpiled to plain CommonJS — see `transpile-activities-to-cjs.ts`. */
  @Column({ name: 'activities_source', type: 'text' })
  activitiesSource!: string;

  /**
   * The source commit this version was compiled from (see ADR 0025 (private),
   * "Ties to ProjectVersion — one commit per publish") — nullable because a version published before
   * this column existed has no commit to point at, and `SET NULL` rather than a hard FK-blocks-delete
   * so a commit row is never pinned in place by an old, otherwise-unrelated `ProjectVersion`.
   */
  @Column({ name: 'commit_id', type: 'uuid', nullable: true })
  commitId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;
}

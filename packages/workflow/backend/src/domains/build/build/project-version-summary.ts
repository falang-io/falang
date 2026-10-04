import type { ProjectVersion } from './project-version.entity.js';

/**
 * `ProjectVersion` minus its artifact (`workflowBundle`/`activitiesSource`) — what the client
 * actually needs to list/display versions. Unlike the old `workflowsPath`/`activitiesPath` columns
 * (short strings, harmless to return as-is), the artifact columns can be megabytes of bundled JS;
 * serializing them into every `publish()`/`listVersions()` response would be wasteful and leak
 * internal build output the client has no use for. `BuildController` returns this, never the raw entity.
 */
export interface IProjectVersionSummary {
  readonly id: string;
  readonly projectId: string;
  readonly versionNumber: number;
  readonly buildId: string;
  /** The source commit this version was compiled from — `null` only for a version published before ADR 0025 (private)'s commit tie-in existed. */
  readonly commitId: string | null;
  readonly createdAt: Date;
}

/** A row of `GET /projects/:id/versions` — the summary plus its live state. */
export interface IProjectVersionListItem extends IProjectVersionSummary {
  /** Production's version (`Project.prodBuildId`, else the latest): where new starts and triggers go while prod is on, and what Start brings up. */
  readonly current: boolean;
  /** Whether this version's runner pod is up right now (a live prod pod may be scaled to zero when idle). */
  readonly running: boolean;
}

export const toVersionSummary = (version: ProjectVersion): IProjectVersionSummary => ({
  id: version.id,
  projectId: version.projectId,
  versionNumber: version.versionNumber,
  buildId: version.buildId,
  commitId: version.commitId,
  createdAt: version.createdAt,
});

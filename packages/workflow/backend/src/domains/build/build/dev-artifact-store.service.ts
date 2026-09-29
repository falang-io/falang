import { Injectable } from '@nestjs/common';
import type { IWorkflowArtifact } from './build-artifact.js';

/**
 * Holds the current dev-build artifact per project, in memory — the dev (unversioned) counterpart
 * to `ProjectVersion`'s DB-persisted `workflowBundle`/`activitiesSource` columns. Dev builds were
 * always ephemeral/kill-and-replace even before k8s (see `BuildService.build()`), so no persistence
 * is needed here; the runner pod fetches whatever's currently stored via
 * `internal-artifacts.controller.ts` at pod start.
 */
@Injectable()
export class DevArtifactStore {
  private readonly artifactsByProjectId = new Map<string, IWorkflowArtifact>();

  set(projectId: string, artifact: IWorkflowArtifact): void {
    this.artifactsByProjectId.set(projectId, artifact);
  }

  get(projectId: string): IWorkflowArtifact | undefined {
    return this.artifactsByProjectId.get(projectId);
  }

  has(projectId: string): boolean {
    return this.artifactsByProjectId.has(projectId);
  }
}

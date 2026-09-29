import { Controller, Get, Header, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Public } from '../../auth/auth/public.decorator.js';
import { ProjectTokenGuard } from '../../internal-auth/project-token.guard.js';
import { DevArtifactStore } from './dev-artifact-store.service.js';
import { ProjectVersion } from './project-version.entity.js';

/**
 * Called by a runner pod at startup to fetch its compiled artifact's content — see
 * ADR 0016 (private)'s "Artifact delivery into the runner pod". Plain
 * text bodies (not JSON-wrapped), since the runner passes the workflow-bundle response straight to
 * `Worker.create({ workflowBundle: { code } })` and the activities response straight to its
 * `Module`-based in-memory loader. Guarded by `ProjectTokenGuard` (per-project scoped token, not
 * `backend`'s user JWT — a runner pod has no user session).
 */
@Public()
@UseGuards(ProjectTokenGuard)
@Controller('internal/artifacts')
export class InternalArtifactsController {
  private readonly devArtifacts: DevArtifactStore;
  private readonly versions: Repository<ProjectVersion>;

  constructor(
    @Inject(DevArtifactStore) devArtifacts: DevArtifactStore,
    @InjectRepository(ProjectVersion) versions: Repository<ProjectVersion>,
  ) {
    this.devArtifacts = devArtifacts;
    this.versions = versions;
  }

  @Get('dev/:projectId/workflow-bundle')
  @Header('content-type', 'text/plain')
  @Header('cache-control', 'no-store')
  getDevWorkflowBundle(@Param('projectId') projectId: string): string {
    return this.getDevArtifact(projectId).workflowBundle;
  }

  @Get('dev/:projectId/activities')
  @Header('content-type', 'text/plain')
  @Header('cache-control', 'no-store')
  getDevActivities(@Param('projectId') projectId: string): string {
    return this.getDevArtifact(projectId).activitiesSource;
  }

  @Get('versions/:projectId/:buildId/workflow-bundle')
  @Header('content-type', 'text/plain')
  @Header('cache-control', 'no-store')
  async getVersionWorkflowBundle(
    @Param('projectId') projectId: string,
    @Param('buildId') buildId: string,
  ): Promise<string> {
    const version = await this.getVersion(projectId, buildId);
    return version.workflowBundle;
  }

  @Get('versions/:projectId/:buildId/activities')
  @Header('content-type', 'text/plain')
  @Header('cache-control', 'no-store')
  async getVersionActivities(@Param('projectId') projectId: string, @Param('buildId') buildId: string): Promise<string> {
    const version = await this.getVersion(projectId, buildId);
    return version.activitiesSource;
  }

  private getDevArtifact(projectId: string): { workflowBundle: string; activitiesSource: string } {
    const artifact = this.devArtifacts.get(projectId);
    if (!artifact) throw new NotFoundException(`No dev build artifact for project "${projectId}"`);
    return artifact;
  }

  private async getVersion(projectId: string, buildId: string): Promise<ProjectVersion> {
    const version = await this.versions.findOneBy({ projectId, buildId });
    if (!version) throw new NotFoundException(`No published version "${buildId}" for project "${projectId}"`);
    return version;
  }
}

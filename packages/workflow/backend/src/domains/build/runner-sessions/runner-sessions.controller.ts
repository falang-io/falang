import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
import { ProjectsService } from '../../projects/projects/projects.service.js';
import { RunnerSessionsService } from './runner-sessions.service.js';
import { parseSessionsQuery, toApiRunnerSession, type IApiRunnerSession } from './to-api-runner-session.js';

/** `GET /projects/:id/runner-sessions` — the owner's (or, read-only, an admin's) uptime history, newest first. */
@Controller('projects/:projectId/runner-sessions')
export class ProjectRunnerSessionsController {
  private readonly sessions: RunnerSessionsService;
  private readonly projects: ProjectsService;

  constructor(
    @Inject(RunnerSessionsService) sessions: RunnerSessionsService,
    @Inject(ProjectsService) projects: ProjectsService,
  ) {
    this.sessions = sessions;
    this.projects = projects;
  }

  @Get()
  async list(
    @Param('projectId') projectId: string,
    @CurrentUser() user: IJwtPayloadUser,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ): Promise<{ sessions: IApiRunnerSession[] }> {
    await this.projects.getOwnedProject(projectId, user.id, 'read');
    const rows = await this.sessions.listForProject(projectId, parseSessionsQuery(limit, before));
    return { sessions: rows.map((row) => toApiRunnerSession(row)) };
  }
}

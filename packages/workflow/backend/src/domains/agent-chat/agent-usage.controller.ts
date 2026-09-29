import { Controller, Get, Inject, Param } from '@nestjs/common';
import { CurrentUser } from '../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { DbAgentUsageSink, type IAgentUsageTotals } from './db-agent-usage-sink.js';

/** `GET /projects/:projectId/agent/usage` — the last 30 days of recorded agent calls for a project the caller owns. */
@Controller('projects/:projectId/agent/usage')
export class AgentUsageController {
  private readonly projectsService: ProjectsService;
  private readonly sink: DbAgentUsageSink;

  constructor(
    @Inject(ProjectsService) projectsService: ProjectsService,
    @Inject(DbAgentUsageSink) sink: DbAgentUsageSink,
  ) {
    this.projectsService = projectsService;
    this.sink = sink;
  }

  @Get()
  async usage(@Param('projectId') projectId: string, @CurrentUser() user: IJwtPayloadUser): Promise<IAgentUsageTotals> {
    await this.projectsService.getOwnedProject(projectId, user.id);
    return this.sink.getProjectTotals(projectId);
  }
}

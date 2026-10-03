import { Controller, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
import { RunsService } from './runs.service.js';

/** Per-project run actions — owner-scoped like every `/projects/:projectId/...` route. */
@Controller('projects/:projectId/runs')
export class ProjectRunsController {
  private readonly runsService: RunsService;

  constructor(@Inject(RunsService) runsService: RunsService) {
    this.runsService = runsService;
  }

  @Post(':workflowId/:runId/terminate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async terminate(
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<void> {
    await this.runsService.terminateRun(user.id, projectId, workflowId, runId);
  }
}

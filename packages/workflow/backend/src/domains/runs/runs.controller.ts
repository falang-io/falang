import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
// Kept as a value import (not `import type`) — see `RunFunctionDto`'s usage in `BuildController` for why:
// Nest's global `ValidationPipe` resolves the DTO class to validate/whitelist against from this
// parameter's runtime type metadata, so erasing the import would silently drop every query field.
// oxlint-disable-next-line consistent-type-imports
import { ListRunsFiltersDto } from './dto/list-runs-filters.dto.js';
import { RunsService, type IWorkflowRunDetail, type IWorkflowRunSummary } from './runs.service.js';

/** Global, cross-project view — see `RunsService`: reads Temporal's own visibility store, scoped to the current user's owned projects. */
@Controller('workflow-runs')
export class RunsController {
  private readonly runsService: RunsService;

  constructor(@Inject(RunsService) runsService: RunsService) {
    this.runsService = runsService;
  }

  @Get()
  listRuns(@Query() filters: ListRunsFiltersDto, @CurrentUser() user: IJwtPayloadUser): Promise<IWorkflowRunSummary[]> {
    return this.runsService.listRuns(user.id, filters);
  }

  @Get(':workflowId/:runId')
  getRunDetail(
    @Param('workflowId') workflowId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IWorkflowRunDetail> {
    return this.runsService.getRunDetail(user.id, workflowId, runId);
  }
}

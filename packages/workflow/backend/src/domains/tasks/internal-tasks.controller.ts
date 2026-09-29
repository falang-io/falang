import { Body, Controller, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { Public } from '../auth/auth/public.decorator.js';
import { ProjectTokenGuard } from '../internal-auth/project-token.guard.js';
// Kept as a value import (not `import type`) — Nest's global `ValidationPipe` resolves the DTO
// class to validate/whitelist against from this parameter's runtime type metadata, same reasoning
// `RunsController`'s own doc comment gives for `ListRunsFiltersDto`.
// oxlint-disable-next-line consistent-type-imports
import { CloseTaskDto } from './dto/close-task.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { CreateTaskDto } from './dto/create-task.dto.js';
import { TasksService } from './tasks.service.js';

/**
 * Called by the compiled `ask`/close activities of a `human-task` (and, per ADR 0040 (private)
 * §4, `telegram-question`'s timeout branch) node — see the ADR §2 and the fixed phase-4 contract.
 * Guarded by `ProjectTokenGuard` exactly like `internal-files`/`internal-credentials`: a leaked
 * token only ever reaches its own project's tasks.
 */
@Public()
@UseGuards(ProjectTokenGuard)
@Controller('internal/tasks')
export class InternalTasksController {
  private readonly tasksService: TasksService;

  constructor(@Inject(TasksService) tasksService: TasksService) {
    this.tasksService = tasksService;
  }

  @Post(':projectId')
  create(@Param('projectId') projectId: string, @Body() body: CreateTaskDto): Promise<{ taskId: string }> {
    return this.tasksService.createOrGet(projectId, body);
  }

  @Post(':projectId/:taskId/close')
  @HttpCode(200)
  async close(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() body: CloseTaskDto,
  ): Promise<Record<string, never>> {
    await this.tasksService.close(projectId, taskId, body.status);
    return {};
  }
}

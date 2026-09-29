import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
// Kept as a value import (not `import type`) — see `RunsController`'s own doc comment for why:
// Nest's global `ValidationPipe` resolves the DTO class to validate/whitelist against from this
// parameter's runtime type metadata.
// oxlint-disable-next-line consistent-type-imports
import { ListTasksFiltersDto } from './dto/list-tasks-filters.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { ResolveTaskDto } from './dto/resolve-task.dto.js';
import { TasksService } from './tasks.service.js';
import type { IApiTask } from './task.types.js';

/** The Tasks page (ADR 0040 (private) §2) — every task of every project the caller **owns**, same ownership rule as `RunsController`. */
@Controller('tasks')
export class TasksController {
  private readonly tasksService: TasksService;

  constructor(@Inject(TasksService) tasksService: TasksService) {
    this.tasksService = tasksService;
  }

  @Get()
  listTasks(@Query() filters: ListTasksFiltersDto, @CurrentUser() user: IJwtPayloadUser): Promise<IApiTask[]> {
    return this.tasksService.list(user.id, filters);
  }

  @Get(':id')
  getTask(@Param('id') id: string, @CurrentUser() user: IJwtPayloadUser): Promise<IApiTask> {
    return this.tasksService.get(user.id, id);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  resolveTask(
    @Param('id') id: string,
    @Body() body: ResolveTaskDto,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IApiTask> {
    return this.tasksService.resolve(user.id, id, body, user.id);
  }
}

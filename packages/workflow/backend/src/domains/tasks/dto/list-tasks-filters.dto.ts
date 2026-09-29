import { IsIn, IsOptional, IsString } from 'class-validator';
import type { TTaskStatus } from '../task.types.js';

const TASK_STATUSES: readonly TTaskStatus[] = ['open', 'done', 'expired', 'cancelled', 'orphaned'];

/** All optional — see `TasksService.list`, an absent field means "don't filter on this" (mirrors `ListRunsFiltersDto`). */
export class ListTasksFiltersDto {
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: TTaskStatus;

  @IsOptional()
  @IsString()
  projectId?: string;
}

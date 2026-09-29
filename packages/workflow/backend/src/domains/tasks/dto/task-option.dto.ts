import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { TTaskOptionDataType } from '../task.types.js';

const TASK_OPTION_DATA_TYPES: readonly TTaskOptionDataType[] = ['void', 'string', 'number', 'boolean'];

/** One `{ label, dataType, prompt? }` button — see `ITaskOption`, ADR 0040 (private) §1. */
export class TaskOptionDto {
  @IsString()
  @MinLength(1)
  label!: string;

  @IsIn(TASK_OPTION_DATA_TYPES)
  dataType!: TTaskOptionDataType;

  @IsOptional()
  @IsString()
  prompt?: string;
}

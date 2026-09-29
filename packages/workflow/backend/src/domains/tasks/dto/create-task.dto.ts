import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { TaskAttachmentDto } from './task-attachment.dto.js';
import { TaskOptionDto } from './task-option.dto.js';

/** Body of `POST /internal/tasks/:projectId` — the compiled `ask` activity's payload, see the fixed phase-4 contract. */
export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  workflowId!: string;

  @IsString()
  @MinLength(1)
  runId!: string;

  @IsString()
  @MinLength(1)
  taskQueue!: string;

  @IsIn(['dev', 'prod'])
  env!: 'dev' | 'prod';

  @IsString()
  @MinLength(1)
  nodeId!: string;

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  /** Structured context displayed as a JSON block — not deep-validated, arbitrary caller-supplied data (see `CreateDocumentDto.data`). */
  @IsOptional()
  payload?: unknown;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskAttachmentDto)
  attachments?: TaskAttachmentDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TaskOptionDto)
  options!: TaskOptionDto[];

  @IsOptional()
  @IsInt()
  timeoutSeconds?: number;
}

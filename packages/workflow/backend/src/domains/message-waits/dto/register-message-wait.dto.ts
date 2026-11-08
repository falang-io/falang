import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { MAX_WAIT_TIMEOUT_MS } from '../message-waits.constants.js';

/** Body of `POST /internal/projects/:projectId/message-waits` — sent by a reply-wait node's activity (ADR 0079 (private)). */
export class RegisterMessageWaitDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  vendor!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  credentialId!: string;

  @IsIn(['dev', 'prod'])
  env!: 'dev' | 'prod';

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  chatId!: string;

  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  @MaxLength(128)
  userId?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  workflowId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  runId!: string;

  @IsInt()
  @Min(1000)
  @Max(MAX_WAIT_TIMEOUT_MS)
  timeoutMs!: number;
}

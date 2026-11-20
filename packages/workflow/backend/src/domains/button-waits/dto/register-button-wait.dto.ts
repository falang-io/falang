import { IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_BUTTON_WAIT_TIMEOUT_MS } from '../button-waits.constants.js';

export class RegisterButtonWaitDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  waitId!: string;

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

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  messageId!: string;

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
  @Max(MAX_BUTTON_WAIT_TIMEOUT_MS)
  timeoutMs!: number;
}

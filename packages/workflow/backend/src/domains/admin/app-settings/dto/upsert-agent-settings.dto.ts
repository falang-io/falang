import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertAgentSettingsDto {
  @IsString()
  @MinLength(1)
  baseUrl!: string;

  @IsString()
  @MinLength(1)
  model!: string;

  /** Omitted to keep the currently-stored key — see `AgentSettingsService.upsert`. */
  @IsOptional()
  @IsString()
  apiKey?: string;
}

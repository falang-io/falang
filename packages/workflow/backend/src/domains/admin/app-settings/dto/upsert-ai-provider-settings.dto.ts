import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertAiProviderSettingsDto {
  @IsString()
  @MinLength(1)
  baseUrl!: string;

  /** Omitted/empty to keep the stored key — see `AiProviderSettingsService.upsert`. */
  @IsOptional()
  @IsString()
  apiKey?: string;

  /** `[{ id, label?, kind: 'chat' | 'image' | 'transcribe' }]`, validated by `parseAiProviderModels`. */
  @IsArray()
  models!: unknown[];
}

import { IsOptional, IsString, MinLength } from 'class-validator';

/** `POST /admin/settings/ai-provider/fetch-models`: both optional, overriding the stored values. */
export class FetchAiProviderModelsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;
}

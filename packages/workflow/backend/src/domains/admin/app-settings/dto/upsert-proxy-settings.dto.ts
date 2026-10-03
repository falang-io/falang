import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertProxySettingsDto {
  @IsString()
  @MinLength(1)
  url!: string;

  /** Omitted/empty to keep the currently-stored token — see `ProxySettingsService.upsert`. */
  @IsOptional()
  @IsString()
  token?: string;

  @IsArray()
  @IsString({ each: true })
  vendors!: string[];
}

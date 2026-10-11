import { IsBoolean, IsInt, IsOptional } from 'class-validator';

export class RuntimeEnvSettingsDto {
  /** `null` = the deployment default. Range (`1..maxIdleMinutes`) is checked in the service against the owner's limit. */
  @IsOptional()
  @IsInt()
  idleMinutes!: number | null;

  @IsBoolean()
  alwaysOn!: boolean;
}

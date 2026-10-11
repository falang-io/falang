import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { RuntimeEnvSettingsDto } from './runtime-env-settings.dto.js';

/** `PUT /projects/:id/runtime-settings` body. */
export class UpdateRuntimeSettingsDto {
  @ValidateNested()
  @Type(() => RuntimeEnvSettingsDto)
  dev!: RuntimeEnvSettingsDto;

  @ValidateNested()
  @Type(() => RuntimeEnvSettingsDto)
  prod!: RuntimeEnvSettingsDto;
}

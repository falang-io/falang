import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { DebugLocationDto } from './debug-location.dto.js';

/** Body of `POST /projects/:projectId/debug/:workflowId/breakpoints` — full replacement of the live breakpoint set, see `IDebugAdapter.setBreakpoints`. */
export class ConfigureBreakpointsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DebugLocationDto)
  breakpoints!: DebugLocationDto[];
}

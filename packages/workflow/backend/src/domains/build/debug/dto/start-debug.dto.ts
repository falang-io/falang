import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { DebugLocationDto } from './debug-location.dto.js';

/** Body of `POST /projects/:projectId/debug/start` — mirrors `StartRunDto` plus the breakpoint set to arm before the first statement can run. */
export class StartDebugDto {
  @IsString()
  @MinLength(1)
  functionName!: string;

  /** Positional, in the function's declared parameter order — not deep-validated, see `RunFunctionDto.args`. */
  @IsArray()
  args!: unknown[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DebugLocationDto)
  breakpoints!: DebugLocationDto[];

  @IsBoolean()
  pauseOnEntry!: boolean;

  /** See `StartRunDto.triggerPayload`. */
  @IsOptional()
  @IsObject()
  triggerPayload?: Record<string, unknown>;
}

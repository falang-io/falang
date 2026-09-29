import { IsArray, IsString, MinLength } from 'class-validator';

/** Body of `POST /projects/:projectId/runs` — always the dev task queue, so no `target` (unlike `RunFunctionDto`). See ADR 0022 (private). */
export class StartRunDto {
  @IsString()
  @MinLength(1)
  functionName!: string;

  /** Positional, in the function's declared parameter order — not deep-validated, see `RunFunctionDto.args`. */
  @IsArray()
  args!: unknown[];
}

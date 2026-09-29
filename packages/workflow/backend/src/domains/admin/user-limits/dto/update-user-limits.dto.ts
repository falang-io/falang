import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * `PUT /admin/users/:id/limits` body — every field is optional (omitted = leave untouched) and,
 * per `class-validator`'s own `IsOptional` (skips all further validators for both `undefined` and
 * `null`), a `null` value is accepted with no `IsInt`/`Min` check at all — `null` is how an admin
 * clears a previously-set override, so it must never be rejected as "not an integer".
 */
export class UpdateUserLimitsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  maxProjectFilesBytes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxFileBytes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  devFileTtlHours?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  ingressFileTtlHours?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxConcurrentProdVersions?: number | null;
}

import { IsInt, IsOptional, IsString, IsUUID, MinLength, Max, Min } from 'class-validator';

export class CreatePersonalAccessTokenDto {
  @IsString()
  @MinLength(1)
  name!: string;

  /** Optional project scope — see ADR 0029 (private)'s PAT decision (per-user, optional project scope). */
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresInDays?: number;
}

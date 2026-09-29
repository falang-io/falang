import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class OAuth2RefreshDto {
  @IsString()
  @MinLength(1)
  credentialId!: string;

  /** Checked by `ProjectTokenGuard` against the request's `x-internal-project-token` header — see ADR 0016 (private)'s "Namespace/RBAC model and inter-pod auth". */
  @IsString()
  @MinLength(1)
  projectId!: string;

  @IsString()
  @MinLength(1)
  vendor!: string;

  @IsString()
  @MinLength(1)
  accessToken!: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

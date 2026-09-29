import { IsIn, IsString, MinLength } from 'class-validator';

export class ResolveCredentialDto {
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
  field!: string;

  @IsIn(['dev', 'prod'])
  env!: 'dev' | 'prod';
}

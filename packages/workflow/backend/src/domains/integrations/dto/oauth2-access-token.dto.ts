import { IsString, MinLength } from 'class-validator';

export class OAuth2AccessTokenDto {
  @IsString()
  @MinLength(1)
  credentialId!: string;

  /** Checked by `ProjectTokenGuard` against the request's `x-internal-project-token` header. */
  @IsString()
  @MinLength(1)
  projectId!: string;

  @IsString()
  @MinLength(1)
  vendor!: string;
}

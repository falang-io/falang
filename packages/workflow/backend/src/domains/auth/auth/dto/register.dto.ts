import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(3, 32)
  username!: string;

  @IsString()
  @Length(8, 72)
  password!: string;

  /** Required to be `true` only when the deployment sets `TERMS_URL`. */
  @IsOptional()
  @IsBoolean()
  acceptTerms?: boolean;
}

import { IsBoolean, IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

/**
 * One body for both signup modes — required fields are checked per mode in `AuthController.register`:
 * `open` needs `username` + `password`; `application` needs `email`, `companyName`, `automationInterest`.
 */
export class RegisterDto {
  @IsOptional()
  @IsString()
  @Length(3, 32)
  username?: string;

  @IsOptional()
  @IsString()
  @Length(8, 72)
  password?: string;

  @IsOptional()
  @IsString()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  companyName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  automationInterest?: string;

  /** Required to be `true` only when the deployment sets `TERMS_URL`. */
  @IsOptional()
  @IsBoolean()
  acceptTerms?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaToken?: string;
}

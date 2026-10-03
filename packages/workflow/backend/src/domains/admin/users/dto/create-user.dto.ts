import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @Length(3, 32)
  username!: string;

  /** Optional; an admin-supplied e-mail is trusted (stored as already verified). */
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

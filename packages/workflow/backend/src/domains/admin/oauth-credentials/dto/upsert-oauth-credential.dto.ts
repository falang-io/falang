import { IsString, MinLength } from 'class-validator';

export class UpsertOAuthCredentialDto {
  @IsString()
  @MinLength(1)
  clientId!: string;

  @IsString()
  @MinLength(1)
  clientSecret!: string;
}

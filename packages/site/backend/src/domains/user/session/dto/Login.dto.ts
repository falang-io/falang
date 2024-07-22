import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username = '';

  @IsString()
  @IsNotEmpty()
  password = '';
}

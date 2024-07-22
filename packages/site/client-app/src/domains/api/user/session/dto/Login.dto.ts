/* File was copied from /server/src/domains/user/session/dto/Login.dto.ts */
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username = '';

  @IsString()
  @IsNotEmpty()
  password = '';
}

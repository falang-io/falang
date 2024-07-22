/* File was copied from /server/src/domains/user/http-api/dto/UserSessionInfo.dto.ts */
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UserSessionInfoDto {
  @IsBoolean()
  loggedIn = false;

  @IsString()
  @IsOptional()
  email = null;

  @IsString()
  @IsOptional()
  username = null;
}

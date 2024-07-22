import { IsString, Matches } from 'class-validator';
import { EMAIL_REGEXP, USERNAME_REGEXP } from '../../user/constants';

export class RegisterDto {
  @IsString()
  @Matches(USERNAME_REGEXP, { message: 'Wrong username' })
  username = '';

  @IsString()
  @Matches(EMAIL_REGEXP, { message: 'Wrong email' })
  email = '';
}

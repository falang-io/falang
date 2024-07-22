import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { EMAIL_REGEXP } from '../constants';
import { ConfirmationDto } from './Confirmation.dto';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  oldPassword = '';

  @IsString()
  @IsNotEmpty()
  newPassword = '';
}

export class ResetPasswordDto {
  @IsString()
  @Matches(EMAIL_REGEXP, { message: 'Wrong email' })
  email = '';
}

export class ResetPasswordFinishDto extends ConfirmationDto {
  @IsString()
  @IsNotEmpty()
  newPassword = '';
}

/* File was copied from /server/src/domains/user/user/dto/Confirmation.dto.ts */
import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmationDto {
  @IsString()
  @IsNotEmpty()
  code = '';
}

import { IsString, MaxLength } from 'class-validator';

export class SendSupportMessageDto {
  // Trimmed and rejected when empty by `SupportService` (a whitespace-only text is 400 too).
  @IsString()
  @MaxLength(4000)
  text!: string;
}

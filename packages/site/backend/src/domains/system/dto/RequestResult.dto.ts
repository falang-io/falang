import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class RequestResultDto {
  @IsBoolean()
  success = true;

  @IsString()
  @IsOptional()
  error?: string;
}

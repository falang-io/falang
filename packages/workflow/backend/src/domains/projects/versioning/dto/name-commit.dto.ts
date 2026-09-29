import { IsString, MinLength } from 'class-validator';

export class NameCommitDto {
  @IsString()
  @MinLength(1)
  message!: string;
}

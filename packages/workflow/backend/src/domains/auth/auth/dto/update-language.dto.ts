import { IsString, Length } from 'class-validator';

export class UpdateLanguageDto {
  @IsString()
  @Length(2, 10)
  language!: string;
}

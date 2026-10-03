import { IsString, MinLength } from 'class-validator';

export class CreateProjectFromTemplateDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

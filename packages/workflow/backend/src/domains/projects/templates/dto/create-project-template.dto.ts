import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateProjectTemplateDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID()
  sourceProjectId!: string;
}

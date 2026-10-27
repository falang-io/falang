import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { ImportProjectDto } from '../../export/dto/import-project.dto.js';

/** Body of `PUT /admin/project-templates/by-slug/:slug`. */
export class UpsertProjectTemplateDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ValidateNested()
  @Type(() => ImportProjectDto)
  payload!: ImportProjectDto;
}

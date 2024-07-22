import { ProjectTypesNames, TProjectTypeName } from '@falang/infrastructures-all'
import { IsString, IsOptional, IsNotEmpty, IsEnum } from 'class-validator';

export const CURRENT_PROJECT_VERSION = 2;


export class ProjectConfigDto {
  @IsEnum([CURRENT_PROJECT_VERSION])
  version = CURRENT_PROJECT_VERSION;

  @IsString()
  @IsNotEmpty()
  name = '';

  @IsEnum(ProjectTypesNames)
  type: TProjectTypeName = 'text';

  @IsString()
  @IsOptional()
  defaultIconBackground?: string

  @IsString()
  @IsOptional()
  schemeBackground?: string
}

export class ProjectConfigDto2 extends ProjectConfigDto {
  
}

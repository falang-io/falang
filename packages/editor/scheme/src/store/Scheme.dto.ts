import { Type } from 'class-transformer'
import { IsEnum, IsNotEmpty, IsNumber, IsSemVer, IsString } from 'class-validator'
import { IconDto } from '../icons/base/Icon.dto'
import { IInfrastructureConfig } from '../infrastructure/IInfrastructureConfig'

export interface ISchemeDto {
  schemeVersion: 2
  id: string
  name: string
  description: string
  root: IconDto
  type: string
}

export const schemeDtoFactory = <TConfig extends IInfrastructureConfig> (config: TConfig) => {  
  class SchemeDto implements ISchemeDto {
    @IsNumber()
    @IsEnum([2])
    schemeVersion: 2 = 2;

    @IsString()
    @IsNotEmpty()
    id = '';

    @IsString()
    @IsNotEmpty()
    name = '';

    @IsString()
    description = ''

    @Type(() => IconDto)
    root = {} as IconDto;

    @IsString()
    @IsNotEmpty()
    infrastructure = ''

    type = ''
  }
  return SchemeDto;
}

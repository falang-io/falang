import { Type } from 'class-transformer';
import { IsAlpha, IsArray, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { BlockDto } from '@falang/editor-scheme';
import { TVariableInfo } from '../../constants';

export class FunctionHeaderParameterDto {
  name = '';
  type: TVariableInfo = {} as TVariableInfo;
}

export class FunctionHeaderBlockDto extends BlockDto {

  @IsString()
  name: string = '';

  @IsArray()
  @Type(() => FunctionHeaderParameterDto)
  @ValidateNested({ each: true })
  parameters: FunctionHeaderParameterDto[] = [];

  @IsObject()
  @IsOptional()
  returnValue: TVariableInfo = {} as TVariableInfo;
}

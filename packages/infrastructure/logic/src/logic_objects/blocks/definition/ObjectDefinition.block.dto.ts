import { Expose } from 'class-transformer';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { BlockDto } from '@falang/editor-scheme';
import { ExpressionTypes, TExpressionType, TVariableInfo } from '../../../logic/constants';

export class ObjectDefinitionBlockDto extends BlockDto {
  @Expose()
  @IsString()
  name = '';

  @Expose()
  @IsObject()
  @IsOptional()
  variableType: TVariableInfo | null = null;
}
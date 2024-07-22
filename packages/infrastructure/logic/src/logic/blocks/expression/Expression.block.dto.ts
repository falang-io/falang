import { Expose } from 'class-transformer';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { BlockDto } from '@falang/editor-scheme';
import { ExpressionTypes, TExpressionType, TVariableInfo } from '../../constants';

export class ExpressionBlockDto extends BlockDto {
  @Expose()
  @IsString()
  expression = '';

  @Expose()
  @IsIn(ExpressionTypes)
  type: TExpressionType = 'assign';

  @Expose()
  @IsObject()
  @IsOptional()
  variableType: TVariableInfo | null = null;
}
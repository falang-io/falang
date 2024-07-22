import { Expose } from 'class-transformer';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { BlockDto } from '@falang/editor-scheme';
import { TVariableInfo } from '../../constants';

export class SwitchThreadHeaderBlockDto extends BlockDto {
  @Expose()
  @IsString()
  expression = '';

  @Expose()
  @IsObject()
  @IsOptional()
  variableType: TVariableInfo | null = null;
}
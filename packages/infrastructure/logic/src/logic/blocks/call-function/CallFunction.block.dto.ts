import { Expose } from 'class-transformer';
import { IsAlpha, IsArray, IsIn, IsOptional, IsSemVer, IsString } from 'class-validator';
import { BlockDto } from '@falang/editor-scheme';
import { CallFunctionBlockTypes, TCallFunctionBlockType } from './TCallFunctionBlockType';

export class CallFunctionBlockDto extends BlockDto {
  @Expose()
  @IsString()
  schemeId = '';

  @Expose()
  @IsString()
  @IsOptional()
  iconId: string | null = null;

  @Expose()
  @IsString({ each: true})
  @IsArray()
  parameters: string[] = [];

  @Expose()
  @IsString()
  returnVariable = '';
}
import { Expose } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsObject, IsString } from 'class-validator';
import { BlockDto } from '@falang/editor-scheme';

export interface ILogicExternalApiVariantDto {
  key: string | number
  value: string
}

export class LogicExternalApiHeadBlockDto extends BlockDto {
  @Expose()
  @IsString()
  @IsNotEmpty()
  name = '';
}

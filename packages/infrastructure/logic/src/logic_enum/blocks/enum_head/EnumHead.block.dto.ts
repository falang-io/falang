import { Expose } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsObject, IsString } from 'class-validator';
import { BlockDto } from '@falang/editor-scheme';
import { EnumValueTypeVariants, TEnumTypeVariant } from '../../../logic/constants';

export interface IEnumVariantDto {
  key: string | number
  value: string
}

export class EnumHeadBlockDto extends BlockDto {
  @Expose()
  @IsString()
  @IsNotEmpty()
  name = '';

  @Expose()
  @IsString()
  @IsIn(EnumValueTypeVariants)
  valueType: TEnumTypeVariant = 'number';
}

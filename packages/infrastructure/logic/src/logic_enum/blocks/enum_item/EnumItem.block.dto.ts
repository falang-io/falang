import { Expose } from 'class-transformer';
import { IsString, Validate } from 'class-validator';
import { BlockDto } from '@falang/editor-scheme';
import { IsNumberOrString } from '@falang/editor-scheme';

export class EnumItemBlockDto extends BlockDto {
  @Expose()
  @Validate(IsNumberOrString)
  key: string = '';

  @Expose()
  @IsString()
  value: string | number = '';
}
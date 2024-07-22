import { Expose } from 'class-transformer';
import { IsString } from 'class-validator';
import { BlockDto } from '@falang/editor-scheme';

export class ArrUnshiftBlockDto extends BlockDto {
  @Expose()
  @IsString()
  arr = '';

  @Expose()
  @IsString()
  variable = '';
}

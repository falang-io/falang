import { Expose } from 'class-transformer';
import { IsString } from 'class-validator';
import { BlockDto } from '@falang/editor-scheme';

export class TextBlockDto extends BlockDto {
  @Expose()
  @IsString()
  text = '';

  @Expose()
  @IsString()
  color = '#ffffff';
}
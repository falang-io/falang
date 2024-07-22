import { Expose } from 'class-transformer';
import { IsString } from 'class-validator';
import { BlockDto } from '@falang/editor-scheme';

export class RackTextBlockDto extends BlockDto {
  @Expose()
  @IsString()
  text = '';

  @Expose()
  @IsString()
  topText = '';

  @Expose()
  @IsString()
  color = '#ffffff';
}
import { Expose } from 'class-transformer';
import { IsString } from 'class-validator';
import { BlockDto } from '@falang/editor-scheme';

export class LinkBlockDto extends BlockDto {
  @Expose()
  @IsString()
  schemeId = '';

  @Expose()
  @IsString()
  text = '';
}

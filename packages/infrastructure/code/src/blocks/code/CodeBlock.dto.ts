import { BlockDto } from '@falang/editor-scheme';
import { Expose } from 'class-transformer';
import { IsString } from 'class-validator';

export class CodeBlockDto extends BlockDto {
  @Expose()
  @IsString()
  code = '';
}
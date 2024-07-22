import { BlockDto } from '@falang/editor-scheme';
import { Expose } from 'class-transformer';
import { IsString } from 'class-validator';

export class LifeGramFunctionFooterBlockDto extends BlockDto {
  @Expose()
  @IsString()
  targetIcon = '';
}

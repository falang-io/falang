import { IsString } from 'class-validator';
import { BlockDto } from '@falang/editor-scheme';

export class ForeachHeaderBlockDto extends BlockDto {
  @IsString()
  arr = '';

  @IsString()
  item = '';

  @IsString()
  index = ''; 
}

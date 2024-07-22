import { IsString } from 'class-validator';
import { BlockDto } from '@falang/editor-scheme';

export class FromToCycleHeaderBlockDto extends BlockDto {
  @IsString()
  from = '';

  @IsString()
  to = '';

  @IsString()
  item = ''; 
}

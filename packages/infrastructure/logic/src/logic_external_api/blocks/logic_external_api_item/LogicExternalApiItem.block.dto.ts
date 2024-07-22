import { Expose } from 'class-transformer';
import { IsString, Validate } from 'class-validator';
import { BlockDto } from '@falang/editor-scheme';
import { IsNumberOrString } from '@falang/editor-scheme';

export class LogicExternalApiItemBlockDto extends BlockDto {
  @Expose()
  @IsString()  
  key: string = '';

  @Expose()  
  @Validate(IsNumberOrString)
  value: string | number = '';
}
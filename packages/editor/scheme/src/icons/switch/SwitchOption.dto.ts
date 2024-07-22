import { IsArray, ValidateNested } from 'class-validator';
import { Expose, Type } from 'class-transformer'
import { IconDto } from '../base/Icon.dto';
import { OutDto } from '../../common/outs/Out.dto';

export class SwitchOptionDto extends IconDto {
  @Expose()
  @IsArray()
  @Type(() => IconDto)
  @ValidateNested()
  children: IconDto[] = []

  @Expose()
  @Type(() => OutDto)
  @ValidateNested()
  out?: OutDto | null = null;
}

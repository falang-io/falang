import { IsArray, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer'
import { IconDto } from '../base/Icon.dto';
import { SwitchOptionDto } from './SwitchOption.dto';

export class SwitchDto extends IconDto {
  @IsArray()
  @Type(() => SwitchOptionDto)
  @ValidateNested({ each: true })
  children: SwitchOptionDto[] = [];

  @IsArray()
  @IsNumber(undefined, { each: true })
  gaps: number[] = [];
}

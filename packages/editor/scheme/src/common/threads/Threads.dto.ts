import { IsArray, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer'
import { IconDto } from '../../icons/base/Icon.dto';
import { IconWithSkewerDto } from '../skewer/IconWithSkewer.dto';

export class ThreadsDto extends IconDto {
  @IsArray()
  @Type(() => IconWithSkewerDto)
  @ValidateNested({ each: true })
  children: IconWithSkewerDto[] = [];

  @IsArray()
  @IsNumber(undefined, { each: true })
  gaps: number[] = [];
}

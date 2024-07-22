import { IsArray, ValidateNested } from 'class-validator';
import { Expose, Type } from 'class-transformer'
import { OutDto } from '../outs/Out.dto';
import { IconDto } from '../../icons/base/Icon.dto';

export class IconWithSkewerDto extends IconDto {
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

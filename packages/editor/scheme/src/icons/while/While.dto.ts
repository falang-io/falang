import { Expose } from 'class-transformer';
import { IsBoolean } from 'class-validator';
import { IconWithSkewerDto } from '../../common/skewer/IconWithSkewer.dto';

export class WhileDto extends IconWithSkewerDto {
  @Expose()
  @IsBoolean()
  trueIsMain?: boolean
}
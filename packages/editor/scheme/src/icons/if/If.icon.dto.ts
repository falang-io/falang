import { Expose } from 'class-transformer';
import { IsBoolean } from 'class-validator';
import { ThreadsDto } from '../../common/threads/Threads.dto';

export class IfIconDto extends ThreadsDto {
  @Expose()
  @IsBoolean()
  trueOnRight = true;
}

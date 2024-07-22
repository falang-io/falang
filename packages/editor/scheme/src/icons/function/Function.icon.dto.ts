import { Expose, Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { BlockDto } from '../../common/blocks/Block.dto';
import { IconWithSkewerDto } from '../../common/skewer/IconWithSkewer.dto';

export class FunctionIconDto extends IconWithSkewerDto {
  @Expose()
  @Type(() => BlockDto)
  @ValidateNested()
  header: BlockDto = {} as BlockDto;

  @Expose()
  @Type(() => BlockDto)
  @ValidateNested()
  footer: BlockDto = {} as BlockDto;
}

import { Expose, Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { BlockDto } from '../blocks/Block.dto';
import { IconDto } from '../../icons/base/Icon.dto';
import { OutTypes, TOutType } from './Out.store';

export class OutDto extends IconDto {
  @Expose()
  @IsEnum(OutTypes)
  @IsNotEmpty()
  type: TOutType = 'break';

  @Expose()
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(20)
  level = 0;

  @IsOptional()
  @Type(() => BlockDto)
  @ValidateNested()
  block: BlockDto = { width: 0 };  
}

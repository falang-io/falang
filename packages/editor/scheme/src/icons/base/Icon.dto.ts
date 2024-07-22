import { Type  } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { BlockDto } from '../../common/blocks/Block.dto';

export class IconDto {
  @IsString()
  @IsNotEmpty()
  id: string = '';

  @IsString()
  @IsNotEmpty()
  alias: string = '';

  @Type(() => BlockDto)
  @ValidateNested()
  block: BlockDto = {} as BlockDto;

  @Type(() => IconDto)
  @ValidateNested()
  @IsOptional()
  leftSide?: IconDto;
}

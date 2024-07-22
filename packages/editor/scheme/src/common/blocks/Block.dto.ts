import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { BLOCK_DEFAULT_WIDTH, BLOCK_MAX_WIDTH, BLOCK_MIN_WIDTH } from '../constants';

export type TBlockDtoConstructor<TDto extends BlockDto = BlockDto> =  new (...args: any[]) => TDto;

export class BlockDto {
  text?: string;
  
  @IsInt()
  @Min(BLOCK_MIN_WIDTH)
  @Max(BLOCK_MAX_WIDTH)
  readonly width = BLOCK_DEFAULT_WIDTH;

  @IsString()
  @IsOptional()
  readonly color?: string;
}

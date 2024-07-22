import { IsArray, IsInstance, IsNumber } from 'class-validator';
import { BlockDto } from '../../common/blocks/Block.dto';
import { IconWithSkewerDto } from '../../common/skewer/IconWithSkewer.dto';
import { IconDto } from '../base/Icon.dto';

export class LifegramFunctionDto extends IconDto {

  @IsArray()
  children: IconDto[] = [];

  @IsArray()
  @IsInstance(BlockDto, {each: true})
  returns: BlockDto[] = [];

  @IsArray()
  @IsNumber(undefined, {each: true})
  returnGaps: number[] = [];
}

export class LifegramFinishDto extends IconWithSkewerDto {
  @IsInstance(BlockDto)
  return: BlockDto = {} as BlockDto;
}

export class LifegramDto extends IconDto {
  @IsInstance(BlockDto)
  headerBlock: BlockDto = {} as BlockDto;

  @IsArray()
  @IsInstance(LifegramFunctionDto, {each: true})
  functions: LifegramFunctionDto[] = [];

  @IsInstance(LifegramFinishDto)
  finish: LifegramFinishDto = {} as LifegramFinishDto;

  @IsArray()
  @IsNumber(undefined, { each: true })
  gaps: number[] = [];
}

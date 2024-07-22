import { IsArray, IsNotEmpty, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Expose, Type } from 'class-transformer'
import { IconDto } from '../base/Icon.dto';

export class ParallelThreadDto {
  @Expose()
  @IsArray()
  @Type(() => IconDto)
  @ValidateNested()
  children: IconDto[] = []

  @Expose()
  @IsString()
  @IsNotEmpty()
  id = '';
}


export class ParallelThreadIconDto extends IconDto {
  @Expose()
  @IsString()
  @IsNotEmpty()
  id = '';

  @Expose()
  @IsArray()
  @Type(() => IconDto)
  @ValidateNested()
  children: IconDto[] = []
}


export class ParallelDto extends IconDto {
  @IsArray()
  @Type(() => ParallelThreadDto)
  @ValidateNested({ each: true })
  children: ParallelThreadDto[] = [];

  @IsArray()
  @IsNumber(undefined, { each: true })
  gaps: number[] = [];
}

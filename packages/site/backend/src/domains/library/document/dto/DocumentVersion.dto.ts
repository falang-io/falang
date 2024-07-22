import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInstance,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class DocumentVersionFilterDto {
  @IsString()
  @IsNotEmpty()
  documentId = '';

  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Transform(({ value }) => parseInt(value))
  offset = -1;

  @IsNumber({ maxDecimalPlaces: 0 })
  @Max(20)
  @Min(1)
  @Transform(({ value }) => parseInt(value))
  limit = -1;
}

export class DocumentVersionListItemDto {
  @IsString()
  @IsNotEmpty()
  id = '';

  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  index = 0;

  @IsDateString()
  created = '';
}

export class DocumentVersionListDto {
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  total = -1;

  @IsInstance(DocumentVersionListItemDto, { each: true })
  @ValidateNested({ each: true })
  items: DocumentVersionListItemDto[] = [];
}

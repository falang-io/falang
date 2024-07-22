import { ISchemeJson, TProjectType, TSchemeIcon } from '@falang/project';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInstance,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export type TDocumentVisibility = 'private' | 'protected' | 'link' | 'public';
type TDocumentsListType = 'my' | 'shared';

export class DocumentIdDto {
  @IsString()
  @IsNotEmpty()
  id = '';
}

export class DocumentListItemDto {
  @IsString()
  @IsNotEmpty()
  id = '';

  @IsString()
  @IsNotEmpty()
  name = '';

  @IsDateString()
  created = '';

  @IsDateString()
  updated = '';
}

export class DocumentListDto {
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  total = -1;

  @IsInstance(DocumentListItemDto, { each: true })
  @ValidateNested({ each: true })
  @Type(() => DocumentListItemDto)
  items: DocumentListItemDto[] = [];
}

export class DocumentFilterDto {
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Transform(({ value }) => parseInt(value))
  offset = 0;

  @IsNumber({ maxDecimalPlaces: 0 })
  @Max(20)
  @Min(1)
  @Transform(({ value }) => parseInt(value))
  limit = 20;

  @IsString()
  type: TDocumentsListType = 'my';
}

export class DocumentDto implements ISchemeJson {
  @IsString()
  @IsNotEmpty()
  id = '';

  @IsString()
  @IsNotEmpty()
  name = '';

  @IsString()
  @IsNotEmpty()
  projectTemplate: TProjectType = 'text';

  @IsString()
  @IsNotEmpty()
  schemeTemplate = '';

  @IsString()
  @IsNotEmpty()
  icon: TSchemeIcon = 'function';

  @IsString()
  description = '';

  @IsObject()
  root: object = {};

  @IsString()
  latestVersionHash = '';

  @IsString()
  visibility: TDocumentVisibility = 'private';

  @IsString()
  @IsOptional()
  author?: string;
}

export class ResponseDocumentDto extends DocumentDto {
  @IsDateString()
  created = '';

  @IsDateString()
  updated = '';
}

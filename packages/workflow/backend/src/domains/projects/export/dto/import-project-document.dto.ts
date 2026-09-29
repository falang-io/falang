import type { INode } from '@falang/dto';
import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class ImportProjectDocumentDto {
  @IsUUID()
  id!: string;

  @IsString()
  @MinLength(1)
  type!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsUUID()
  folderId?: string | null;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  /** Not deep-validated — arbitrary node trees, see `CreateDocumentDto.root`. */
  @IsOptional()
  root?: INode | null;

  @IsOptional()
  data?: unknown;
}

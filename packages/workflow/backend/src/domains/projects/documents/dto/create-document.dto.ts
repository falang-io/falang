import type { INode } from '@falang/dto';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateDocumentDto {
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

  /** Not deep-validated — arbitrary node trees are produced by the trusted, authenticated editor client. */
  @IsOptional()
  root?: INode | null;

  @IsOptional()
  data?: unknown;
}

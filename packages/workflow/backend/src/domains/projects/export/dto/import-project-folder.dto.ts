import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class ImportProjectFolderDto {
  @IsUUID()
  id!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  /** Set on a fixed section folder of the exporting project (`'triggers' | 'functions' | 'types'`); absent in files exported before ADR 0055 (private). */
  @IsOptional()
  @IsString()
  fixedKind?: string | null;
}

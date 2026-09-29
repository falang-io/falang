import { IsString, MinLength } from 'class-validator';

export class ImportProjectMetaDto {
  /** Always blank in a real export payload — a fresh id is minted on import, see `ProjectExportService`. Not validated as a UUID since the export deliberately writes `''` here. */
  @IsString()
  id!: string;

  @IsString()
  @MinLength(1)
  name!: string;
}

import { Type } from 'class-transformer';
import { IsArray, IsIn, ValidateNested } from 'class-validator';
import { ImportProjectDocumentDto } from './import-project-document.dto.js';
import { ImportProjectFolderDto } from './import-project-folder.dto.js';
import { ImportProjectMetaDto } from './import-project-meta.dto.js';

export class ImportProjectDto {
  @IsIn([1])
  formatVersion!: 1;

  @ValidateNested()
  @Type(() => ImportProjectMetaDto)
  project!: ImportProjectMetaDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportProjectFolderDto)
  folders!: ImportProjectFolderDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportProjectDocumentDto)
  documents!: ImportProjectDocumentDto[];
}

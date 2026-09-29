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
}

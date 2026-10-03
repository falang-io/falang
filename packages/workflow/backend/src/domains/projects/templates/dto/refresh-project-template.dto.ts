import { IsUUID } from 'class-validator';

export class RefreshProjectTemplateDto {
  @IsUUID()
  sourceProjectId!: string;
}

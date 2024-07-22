import { TProjectTypeName } from '@falang/infrastructures-all';
import { ISchemeDto } from '@falang/editor-scheme';

export interface IDocumentDto {
  projectType: TProjectTypeName
  documentType: string
  scheme: ISchemeDto
}
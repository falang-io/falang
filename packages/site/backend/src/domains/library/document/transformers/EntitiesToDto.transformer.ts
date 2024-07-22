import { Injectable } from '@nestjs/common';
import { DocumentDto } from '../dto/Document.dto';
import { IDocumentWithVersion } from '../interfaces/IDocumentWithVersion';
import { TProjectType } from '@falang/project';

@Injectable()
export class EntitiesToTdoTransformer {
  transform({ document, version }: IDocumentWithVersion): DocumentDto {
    const dto = new DocumentDto();
    dto.id = document.id;
    dto.description = version.description;
    dto.latestVersionHash = version.hash;
    dto.name = document.name;
    dto.root = version.data;
    //dto.template = document.template;
    dto.projectTemplate = document.projectTemplate as TProjectType;
    dto.schemeTemplate = document.schemeTemplate;
    return dto;
  }
}

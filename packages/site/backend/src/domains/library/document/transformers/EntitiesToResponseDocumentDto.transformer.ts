import { Injectable } from '@nestjs/common';
import { ResponseDocumentDto } from '../dto/Document.dto';
import { IDocumentWithVersion } from '../interfaces/IDocumentWithVersion';
import { TProjectType, TSchemeIcon } from '@falang/project';

@Injectable()
export class EntitiesToResponseDocumentDtoTransformer {
  transform({ document, version }: IDocumentWithVersion): ResponseDocumentDto {
    const dto = new ResponseDocumentDto();
    dto.created = document.created.toISOString();
    dto.updated = document.updated.toISOString();
    dto.description = version.description;
    dto.visibility = document.visibility;
    dto.id = document.id;
    dto.latestVersionHash = version.hash;
    dto.name = document.name;
    dto.root = version.data;
    dto.projectTemplate = document.projectTemplate as TProjectType;
    dto.schemeTemplate = document.schemeTemplate;
    dto.icon = document.icon as TSchemeIcon;

    return dto;
  }
}

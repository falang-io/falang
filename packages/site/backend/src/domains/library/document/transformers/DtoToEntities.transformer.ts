import { Injectable } from '@nestjs/common';
import { DocumentDto } from '../dto/Document.dto';
import { createHash } from 'crypto';
import { IDocumentWithVersion } from '../interfaces/IDocumentWithVersion';

const hash = createHash('sha1');

interface DtoToEntitiesTransformerParams {
  dto: DocumentDto;
  entities: IDocumentWithVersion;
}

@Injectable()
export class DtoToEntitesTransformer {
  transform({
    dto,
    entities: { document, version },
  }: DtoToEntitiesTransformerParams): IDocumentWithVersion {
    document.name = dto.name;
    document.visibility = dto.visibility;
    version.id = dto.id;
    version.documentId = document.id;
    version.description = dto.description;
    version.name = dto.name;
    version.data = dto.root;
    version.hash = this.hashData(version.data);
    return {
      document,
      version,
    };
  }

  hashData(data: object): string {
    return hash.copy().update(JSON.stringify(data)).digest('base64');
  }
}

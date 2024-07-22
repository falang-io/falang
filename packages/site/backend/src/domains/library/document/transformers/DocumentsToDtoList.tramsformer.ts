import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DocumentListDto, DocumentListItemDto } from '../dto/Document.dto';
import { Document } from '../entites/Document.entity';

@Injectable()
export class DocumentsToDtoListTransformer {
  transform(total: number, documents: Document[]): DocumentListDto {
    const dto = new DocumentListDto();
    dto.items = documents.map((doc) => {
      if (!doc.versions) {
        throw new InternalServerErrorException(
          `Document #${doc.id} without versions`,
        );
      }
      if (doc.versions.length !== 1) {
        throw new InternalServerErrorException(
          `In doc #${doc.id} should be 1 latest version, got ${doc.versions.length}`,
        );
      }
      const docDto = new DocumentListItemDto();
      docDto.id = doc.id;
      docDto.name = doc.name;
      docDto.created = doc.created.toISOString();
      docDto.updated = doc.updated.toISOString();
      return docDto;
    });
    dto.total = total;
    return dto;
  }
}

import { Injectable } from '@nestjs/common';
import {
  DocumentVersionListDto,
  DocumentVersionListItemDto,
} from '../dto/DocumentVersion.dto';
import { DocumentVersion } from '../entites/DocumentVersion.entity';

@Injectable()
export class VersionsToListDtoTransformer {
  transform(
    total: number,
    versions: DocumentVersion[],
  ): DocumentVersionListDto {
    const dto = new DocumentVersionListDto();
    dto.total = total;
    dto.items = versions.map((v) => {
      const itemDto = new DocumentVersionListItemDto();
      itemDto.created = v.created.toISOString();
      itemDto.index = v.versionIndex;
      itemDto.id = v.id;
      return itemDto;
    });
    return dto;
  }
}

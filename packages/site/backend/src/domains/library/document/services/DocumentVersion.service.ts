import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DocumentVersionDal } from '../dal/DocumentVersion.dal';
import { DocumentVersionFilterDto } from '../dto/DocumentVersion.dto';

@Injectable()
export class DocumentVersionService {
  constructor(private versions: DocumentVersionDal) {}

  read(dto: DocumentVersionFilterDto, userId: number, em?: EntityManager) {
    return this.versions.getListForUser(dto, userId, em);
  }
}

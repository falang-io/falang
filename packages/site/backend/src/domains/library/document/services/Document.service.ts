import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UserDal } from '../../../user/user/dal/User.dal';
import { DocumentDal } from '../dal/Document.dal';
import { DocumentVersionDal } from '../dal/DocumentVersion.dal';
import {
  DocumentDto,
  DocumentFilterDto,
  ResponseDocumentDto,
} from '../dto/Document.dto';
import { EntitiesToResponseDocumentDtoTransformer } from '../transformers/EntitiesToResponseDocumentDto.transformer';

@Injectable()
export class DocumentService {
  constructor(
    private docs: DocumentDal,
    private versions: DocumentVersionDal,
    private entitiesToDto: EntitiesToResponseDocumentDtoTransformer,
    private users: UserDal,
  ) {}

  async create(doc: DocumentDto, userId: number) {
    const { document, version } = await this.docs.create(doc, userId);
    return this.entitiesToDto.transform({ document, version });
  }

  async read(filter: DocumentFilterDto, userId: number | null) {
    return await this.docs.getList(filter, userId);
  }

  async update(doc: DocumentDto, userId: number) {
    return await this.docs.update(doc, userId);
  }

  async delete(id: string, userId: number) {
    return await this.docs.delete(id, userId);
  }

  async getForUser(
    documentId: string,
    userId: number | null,
    em?: EntityManager,
  ): Promise<ResponseDocumentDto> {
    const document = await this.docs.getById(documentId, em);
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (
      document.visibility !== 'public' &&
      document.visibility !== 'link' &&
      document.userId !== userId
    ) {
      throw new ForbiddenException('Forbidden');
    }
    const version = await this.versions.getLatestForDocument(documentId, em);
    const response = this.entitiesToDto.transform({ document, version });

    const user = await this.users.getById(document.userId);
    response.author = user?.username;

    return response;
  }
}

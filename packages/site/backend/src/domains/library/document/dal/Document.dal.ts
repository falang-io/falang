import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { BaseDal } from '../../../system/database/dal/Base.dal';
import {
  DocumentDto,
  DocumentFilterDto,
  DocumentListDto,
} from '../dto/Document.dto';
import { Document } from '../entites/Document.entity';
import { DocumentVersion } from '../entites/DocumentVersion.entity';
import { IDocumentWithVersion } from '../interfaces/IDocumentWithVersion';
import { DocumentsToDtoListTransformer } from '../transformers/DocumentsToDtoList.tramsformer';
import { DtoToEntitesTransformer } from '../transformers/DtoToEntities.transformer';
import { EntitiesToTdoTransformer } from '../transformers/EntitiesToDto.transformer';
import { DocumentVersionDal } from './DocumentVersion.dal';

const MAX_DOCUMENTS_PER_USER = 30;

@Injectable()
export class DocumentDal extends BaseDal<Document> {
  constructor(
    private dtoToEntities: DtoToEntitesTransformer,
    private docsToList: DocumentsToDtoListTransformer,
    private entitiesToTdo: EntitiesToTdoTransformer,
    private versions: DocumentVersionDal,
    @InjectEntityManager()
    em: EntityManager,
  ) {
    super({
      em,
      entity: Document,
    });
  }

  async create(
    dto: DocumentDto,
    userId: number,
    em?: EntityManager,
  ): Promise<IDocumentWithVersion> {
    return await this.transaction(em, async (em) => {
      return await this._create(dto, userId, em);
    });
  }

  private async _create(
    dto: DocumentDto,
    userId: number,
    em: EntityManager,
  ): Promise<IDocumentWithVersion> {
    const repo = this.getRepository(em);
    const oldDocument = await repo.findOneBy({
      id: dto.id,
    });
    if (oldDocument) {
      throw new BadRequestException(`Document with that id already exists`);
    }
    const count = await repo
      .createQueryBuilder('doc')
      .where('doc.userId=:userId', { userId })
      .andWhere('doc.deleted is null')
      .getCount();

    if (count >= MAX_DOCUMENTS_PER_USER) {
      throw new BadRequestException(
        `Sorry, but in free version you can create only ${MAX_DOCUMENTS_PER_USER} documents. Remove some documents to create new.`,
      );
    }
    let document = repo.create();
    document.id = dto.id;
    document.userId = userId;
    document.icon = dto.icon;
    //document.template = dto.template;
    document.template = dto.projectTemplate;
    document.projectTemplate = dto.projectTemplate;
    dto.schemeTemplate = dto.schemeTemplate;

    document = await repo.save(document);

    const version = await this.versions.getVersionToUpdate(
      document.id,
      false,
      em,
    );

    return await this.finishUpdate(dto, document, version, em);
  }

  async update(
    dto: DocumentDto,
    userId: number,
  ): Promise<IDocumentWithVersion> {
    return await this.transaction(undefined, async (em) => {
      return await this._update(dto, userId, em);
    });
  }

  private async _update(
    dto: DocumentDto,
    userId: number,
    em: EntityManager,
  ): Promise<IDocumentWithVersion> {
    const repo = this.getRepository(em);
    const document = await repo.findOneBy({ id: dto.id });

    if (!document) {
      throw new NotFoundException(`Document #${dto.id} not found`);
    }
    if (document.userId !== userId) {
      throw new ForbiddenException('You are not owner of document');
    }

    const version = await this.versions.getVersionToUpdate(
      document.id,
      false,
      em,
    );

    return await this.finishUpdate(dto, document, version, em);
  }

  private async finishUpdate(
    dto: DocumentDto,
    document: Document,
    version: DocumentVersion,
    em: EntityManager,
  ): Promise<IDocumentWithVersion> {
    const transformResult = this.dtoToEntities.transform({
      dto,
      entities: { document, version },
    });

    transformResult.document.updated = new Date();

    console.log('to save:', transformResult, dto);

    document = await this.getRepository(em).save(transformResult.document);
    version = await this.versions.save(transformResult.version, em);

    return { document, version };
  }

  async getList(
    dto: DocumentFilterDto,
    userId: number | null,
    em?: EntityManager,
  ): Promise<DocumentListDto> {
    const qb = this.getRepository(em)
      .createQueryBuilder('doc')
      .innerJoinAndSelect('doc.versions', 'v')
      .andWhere('v.latest = :latest', { latest: true })
      .andWhere('doc.deleted is null')
      .limit(dto.limit)
      .offset(dto.offset)
      .orderBy('doc.updated', 'DESC');
    if (dto.type === 'my') {
      qb.andWhere('doc.userId = :userId', { userId });
    } else {
      qb.andWhere('doc.visibility = :visibility', { visibility: 'public' });
      qb.andWhere('doc.moderatedForLibrary = :moderatedForLibrary', {
        moderatedForLibrary: true,
      });
    }
    const result = await qb.getManyAndCount();
    return this.docsToList.transform(result[1], result[0]);
  }

  async getDocument(id: string, em?: EntityManager): Promise<Document> {
    const doc = await this.getRepository(em).findOneBy({ id });
    if (!doc) {
      throw new NotFoundException(`Document #${id} not found`);
    }
    return doc;
  }

  async delete(documentId: string, userId: number): Promise<void> {
    return await this.transaction(undefined, async (em) => {
      return await this._delete(documentId, userId, em);
    });
  }

  private async _delete(id: string, userId: number, em: EntityManager) {
    const document = await this.getDocument(id, em);
    if (document.userId !== userId) {
      throw new ForbiddenException('You not owner of this document');
    }
    await this.versions.deleteNotLastVersions(id, em);
    await this.getRepository(em).softDelete(document.id);
  }

  async getByIdForAuthor(
    documentId: string,
    authorId: number,
    em?: EntityManager,
  ): Promise<Document> {
    const entity = await this.getRepository(em)
      .createQueryBuilder('document')
      .where('document.id = :documentId', { documentId })
      .andWhere('document.userId = :userId', { userId: authorId })
      .getOne();
    if (!entity) {
      throw new NotFoundException(`Document #${documentId} not found.`);
    }
    return entity;
  }
}

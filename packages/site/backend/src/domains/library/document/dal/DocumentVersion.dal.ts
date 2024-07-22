import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { PinoLogger } from 'nestjs-pino';
import { EntityManager } from 'typeorm';
import { BaseDal } from '../../../system/database/dal/Base.dal';
import { DocumentVersion } from '../entites/DocumentVersion.entity';
import { v4 as uuidV4 } from 'uuid';
import {
  DocumentVersionFilterDto,
  DocumentVersionListDto,
} from '../dto/DocumentVersion.dto';
import { VersionsToListDtoTransformer } from '../transformers/VersionsToListDto.transformer';

const TIMEOUT_FROM_CREATE = 1000 * 60 * 60;

@Injectable()
export class DocumentVersionDal extends BaseDal<DocumentVersion> {
  constructor(
    private logger: PinoLogger,
    @InjectEntityManager()
    em: EntityManager,
    private transformer: VersionsToListDtoTransformer,
  ) {
    super({
      em,
      entity: DocumentVersion,
    });
  }

  async getLatestVersion(
    documentId: string,
    em?: EntityManager,
  ): Promise<DocumentVersion | null> {
    return (
      (await this.getRepository(em).findOneBy({
        documentId,
        latest: true,
      })) || null
    );
  }

  async getVersionToUpdate(
    documentId: string,
    forceUpdate = false,
    em?: EntityManager,
  ): Promise<DocumentVersion> {
    let version: DocumentVersion | null = null;
    let currentVersionIndex = 0;
    if (!forceUpdate) {
      version = await this.getLatestVersion(documentId, em);
      if (version) {
        currentVersionIndex = version.versionIndex;
        if (version.created.getTime() < Date.now() + TIMEOUT_FROM_CREATE) {
          version = null;
        }
      }
    }
    if (!version) {
      version = this.getRepository(em).create();
      version.id = uuidV4();
      version.versionIndex = currentVersionIndex + 1;
      version.documentId = documentId;
      version.latest = true;
    }
    return version;
  }

  async save(version: DocumentVersion, em?: EntityManager) {
    return await this.getRepository(em).save(version);
  }

  async deleteNotLastVersions(documentId: string, em?: EntityManager) {
    await this.getRepository(em).softDelete({
      documentId,
      latest: false,
    });
  }

  async getListForUser(
    { documentId, limit, offset }: DocumentVersionFilterDto,
    userId: number,
    em?: EntityManager,
  ): Promise<DocumentVersionListDto> {
    const [versions, total] = await this.getRepository(em)
      .createQueryBuilder('version')
      .where('documentId = :documentId', { documentId })
      .orderBy('version.created', 'DESC')
      .innerJoinAndSelect('version.document', 'document')
      .andWhere('document.userId = :userId', { userId })
      .limit(limit)
      .offset(offset)
      .getManyAndCount();
    return this.transformer.transform(total, versions);
  }

  async getLatestForDocument(
    documentId: string,
    em?: EntityManager,
  ): Promise<DocumentVersion> {
    return await this.getRepository(em)
      .createQueryBuilder('v')
      .where('v.documentId = :documentId', { documentId })
      .andWhere('v.latest = :latest', { latest: true })
      .getOneOrFail();
  }
}

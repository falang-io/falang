import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from '../../system/database/Database.module';
import { LogModule } from '../../system/log/Log.module';
import { UserModule } from '../../user/user/User.module';
import { DocumentDal } from './dal/Document.dal';
import { DocumentVersionDal } from './dal/DocumentVersion.dal';
import { Document } from './entites/Document.entity';
import { DocumentVersion } from './entites/DocumentVersion.entity';
import { DocumentService } from './services/Document.service';
import { DocumentVersionService } from './services/DocumentVersion.service';
import { DocumentsToDtoListTransformer } from './transformers/DocumentsToDtoList.tramsformer';
import { DtoToEntitesTransformer } from './transformers/DtoToEntities.transformer';
import { EntitiesToTdoTransformer } from './transformers/EntitiesToDto.transformer';
import { EntitiesToResponseDocumentDtoTransformer } from './transformers/EntitiesToResponseDocumentDto.transformer';
import { VersionsToListDtoTransformer } from './transformers/VersionsToListDto.transformer';

@Module({
  imports: [
    LogModule,
    DatabaseModule,
    UserModule,
    TypeOrmModule.forFeature([Document, DocumentVersion]),
  ],
  providers: [
    DocumentDal,
    DocumentVersionDal,
    DocumentService,
    DocumentVersionService,
    DocumentsToDtoListTransformer,
    DtoToEntitesTransformer,
    EntitiesToTdoTransformer,
    VersionsToListDtoTransformer,
    EntitiesToResponseDocumentDtoTransformer,
  ],
  exports: [DocumentService, DocumentVersionService],
})
export class LibraryDocumentModule {}

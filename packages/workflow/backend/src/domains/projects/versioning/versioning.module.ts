import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DEFAULT_AUTO_VERSION_GAP_MS } from '@falang/versioning';
import { IntegrationsModule } from '../../integrations/integrations.module.js';
import { User } from '../../users/users/user.entity.js';
import { Document } from '../documents/document.entity.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { ProjectExportModule } from '../export/project-export.module.js';
import { FoldersModule } from '../folders/folders.module.js';
import { Project } from '../projects/project.entity.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { ProjectBlob } from './project-blob.entity.js';
import { ProjectCommit } from './project-commit.entity.js';
import { AUTO_VERSION_GAP_MS, VersioningService } from './versioning.service.js';
import { SessionGapAutoVersionInterceptor } from './session-gap-auto-version.interceptor.js';
import { VersioningController } from './versioning.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectCommit, ProjectBlob, Document, Project, User]),
    ProjectsModule,
    ProjectExportModule,
    DocumentsModule,
    FoldersModule,
    IntegrationsModule,
  ],
  controllers: [VersioningController],
  providers: [
    VersioningService,
    {
      provide: AUTO_VERSION_GAP_MS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.get<number>('AUTO_VERSION_GAP_MS', DEFAULT_AUTO_VERSION_GAP_MS),
    },
    // Registered globally (not per-controller) — see `SessionGapAutoVersionInterceptor`'s own doc
    // comment for why this must live here rather than on `DocumentsModule`/`FoldersModule`.
    { provide: APP_INTERCEPTOR, useClass: SessionGapAutoVersionInterceptor },
  ],
  exports: [VersioningService],
})
export class VersioningModule {}

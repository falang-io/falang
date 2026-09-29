import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationsModule } from '../../integrations/integrations.module.js';
import { Document } from '../documents/document.entity.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { FoldersModule } from '../folders/folders.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { ProjectExportController } from './project-export.controller.js';
import { ProjectExportService } from './project-export.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Document]), ProjectsModule, FoldersModule, DocumentsModule, IntegrationsModule],
  controllers: [ProjectExportController],
  providers: [ProjectExportService],
  // Consumed directly by `McpModule` (ADR 0029 (private) phase F).
  // Also reused by `VersioningService` (`versioning.module.ts`) as the working copy's
  // `IProjectSnapshot` source — see ADR 0025 (private), "getWorkingCopy()
  // exists so the diff UI can compare HEAD against the live state through the same interface".
  exports: [ProjectExportService],
})
export class ProjectExportModule {}

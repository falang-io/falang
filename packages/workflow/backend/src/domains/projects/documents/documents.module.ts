import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationsModule } from '../../integrations/integrations.module.js';
import { IntegrationVendorDataModule } from '../../integrations/vendor-data/integration-vendor-data.module.js';
import { UserLimitsModule } from '../../admin/user-limits/user-limits.module.js';
import { TablesModule } from '../../tables/tables.module.js';
import { Folder } from '../folders/folder.entity.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { Document } from './document.entity.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, Folder]),
    ProjectsModule,
    IntegrationsModule,
    IntegrationVendorDataModule,
    UserLimitsModule,
    TablesModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}

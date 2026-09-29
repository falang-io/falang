import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationsModule } from '../../integrations/integrations.module.js';
import { IntegrationVendorDataModule } from '../../integrations/vendor-data/integration-vendor-data.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { Document } from './document.entity.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Document]), ProjectsModule, IntegrationsModule, IntegrationVendorDataModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OAuthCredentialsModule } from '../admin/oauth-credentials/oauth-credentials.module.js';
import { ProjectTokenModule } from '../internal-auth/project-token.module.js';
import { Document } from '../projects/documents/document.entity.js';
import { ProjectsModule } from '../projects/projects/projects.module.js';
import { ActivepiecesCatalogService } from './activepieces-catalog.service.js';
import { ActivepiecesFieldOptionsController } from './activepieces-field-options.controller.js';
import { ActivepiecesPiecesController } from './activepieces-pieces.controller.js';
import { IntegrationFieldOptionsController } from './integration-field-options.controller.js';
import { InternalCredentialsController } from './internal-credentials.controller.js';
import { OAuth2Controller } from './oauth2.controller.js';
import { OAuth2PendingStateService } from './oauth2-pending-state.service.js';
import { IntegrationVendorDataController } from './vendor-data/integration-vendor-data.controller.js';
import { IntegrationVendorDataModule } from './vendor-data/integration-vendor-data.module.js';
import { SyncVendorDataController } from './vendor-data/sync-vendor-data.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document]),
    ProjectsModule,
    ProjectTokenModule,
    OAuthCredentialsModule,
    IntegrationVendorDataModule,
  ],
  controllers: [
    InternalCredentialsController,
    IntegrationFieldOptionsController,
    IntegrationVendorDataController,
    SyncVendorDataController,
    ActivepiecesPiecesController,
    ActivepiecesFieldOptionsController,
    OAuth2Controller,
  ],
  providers: [ActivepiecesCatalogService, OAuth2PendingStateService],
  exports: [ActivepiecesCatalogService, ProjectTokenModule],
})
export class IntegrationsModule {}

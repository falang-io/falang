import { Module } from '@nestjs/common';
import { OAUTH2_ACCESS_TOKEN_PORT } from '@falang/workflow-gateway';
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
import { OAuth2AccessTokenService } from './oauth2-access-token.service.js';
import { OAuth2Controller } from './oauth2.controller.js';
import { OAuth2PendingStateRow } from './oauth2-pending-state.entity.js';
import { OAuth2PendingStateService } from './oauth2-pending-state.service.js';
import { IntegrationVendorDataController } from './vendor-data/integration-vendor-data.controller.js';
import { IntegrationVendorDataModule } from './vendor-data/integration-vendor-data.module.js';
import { WebhookSecretController } from './webhook-secret.controller.js';
import { SyncVendorDataController } from './vendor-data/sync-vendor-data.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, OAuth2PendingStateRow]),
    ProjectsModule,
    ProjectTokenModule,
    OAuthCredentialsModule,
    IntegrationVendorDataModule,
  ],
  controllers: [
    InternalCredentialsController,
    IntegrationFieldOptionsController,
    WebhookSecretController,
    IntegrationVendorDataController,
    SyncVendorDataController,
    ActivepiecesPiecesController,
    ActivepiecesFieldOptionsController,
    OAuth2Controller,
  ],
  providers: [
    ActivepiecesCatalogService,
    OAuth2PendingStateService,
    OAuth2AccessTokenService,
    // `ctx.getOAuth2AccessToken()` for vendor ingress (amoCRM webhook subscription) — wired in `app.module.ts`.
    { provide: OAUTH2_ACCESS_TOKEN_PORT, useExisting: OAuth2AccessTokenService },
  ],
  exports: [ActivepiecesCatalogService, ProjectTokenModule, OAuth2AccessTokenService, OAUTH2_ACCESS_TOKEN_PORT],
})
export class IntegrationsModule {}

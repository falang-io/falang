import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationVendorData } from './integration-vendor-data.entity.js';
import { IntegrationVendorDataService } from './integration-vendor-data.service.js';

/**
 * A small, dependency-free module (same shape as `AppSettingsModule`/`OAuthCredentialsModule`) so
 * both `IntegrationsModule` (the `GET .../vendor-data` route, the future sync-schema route) and
 * `DocumentsModule` (removing an instance's vendor data when it's dropped from the `integrations`
 * document, or the document itself is deleted) can import it without a cycle.
 */
@Module({
  imports: [TypeOrmModule.forFeature([IntegrationVendorData])],
  providers: [IntegrationVendorDataService],
  exports: [IntegrationVendorDataService],
})
export class IntegrationVendorDataModule {}

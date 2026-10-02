import { Module } from '@nestjs/common';
import { AppSettingsModule } from '../admin/app-settings/app-settings.module.js';
import { ProjectTokenModule } from '../internal-auth/project-token.module.js';
import { InternalEgressProxyController } from './internal-egress-proxy.controller.js';

/** See ADR 0056 (private). */
@Module({
  imports: [AppSettingsModule, ProjectTokenModule],
  controllers: [InternalEgressProxyController],
})
export class EgressProxyModule {}

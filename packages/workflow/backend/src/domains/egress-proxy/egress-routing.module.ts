import { Module } from '@nestjs/common';
import { AppSettingsModule } from '../admin/app-settings/app-settings.module.js';
import { EgressRoutingService } from './egress-routing.service.js';

/** Installs process-wide egress routing — in `AppModule` only, never in the test harness. See ADR 0056 (private). */
@Module({ imports: [AppSettingsModule], providers: [EgressRoutingService] })
export class EgressRoutingModule {}

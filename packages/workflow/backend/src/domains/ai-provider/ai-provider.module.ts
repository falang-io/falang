import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSettingsModule } from '../admin/app-settings/app-settings.module.js';
import { ProjectTokenModule } from '../internal-auth/project-token.module.js';
import { ProjectsModule } from '../projects/projects/projects.module.js';
import { AiProviderRelayGuard } from './ai-provider-relay.guard.js';
import { AiProviderRelayService } from './ai-provider-relay.service.js';
import { AiProviderStatusController } from './ai-provider-status.controller.js';
import { InternalAiProviderRelayController } from './internal-ai-provider-relay.controller.js';
import { AiProviderUsage } from './ai-provider-usage.entity.js';
import { DbAiProviderUsageSink } from './db-ai-provider-usage-sink.js';

/**
 * The built-in AI provider for workflow OpenAI nodes (ADR 0081 (private)): `GET /ai-provider`, the community usage
 * record and the relay runner pods call (`/internal/ai-provider/:projectId/:env/*`). `AI_PROVIDER_USAGE_SINK` is deliberately not provided here: its consumer
 * injects it `@Optional()` and falls back to `DbAiProviderUsageSink`, so a `@Global()` module exporting the token (the
 * hosted edition's billing) overrides the community default without touching this module.
 */
@Module({
  controllers: [AiProviderStatusController, InternalAiProviderRelayController],
  imports: [AppSettingsModule, ProjectsModule, ProjectTokenModule, TypeOrmModule.forFeature([AiProviderUsage])],
  providers: [DbAiProviderUsageSink, AiProviderRelayService, AiProviderRelayGuard],
  exports: [DbAiProviderUsageSink, AppSettingsModule],
})
export class AiProviderModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSettingsModule } from '../admin/app-settings/app-settings.module.js';
import { AiProviderStatusController } from './ai-provider-status.controller.js';
import { AiProviderUsage } from './ai-provider-usage.entity.js';
import { DbAiProviderUsageSink } from './db-ai-provider-usage-sink.js';

/**
 * The built-in AI provider for workflow OpenAI nodes (ADR 0081 (private)): `GET /ai-provider` and the community usage
 * record; the relay joins this module later. `AI_PROVIDER_USAGE_SINK` is deliberately not provided here: its consumer
 * injects it `@Optional()` and falls back to `DbAiProviderUsageSink`, so a `@Global()` module exporting the token (the
 * hosted edition's billing) overrides the community default without touching this module.
 */
@Module({
  controllers: [AiProviderStatusController],
  imports: [AppSettingsModule, TypeOrmModule.forFeature([AiProviderUsage])],
  providers: [DbAiProviderUsageSink],
  exports: [DbAiProviderUsageSink, AppSettingsModule],
})
export class AiProviderModule {}

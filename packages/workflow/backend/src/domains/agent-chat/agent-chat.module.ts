import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSettingsModule } from '../admin/app-settings/app-settings.module.js';
import { ProjectsModule } from '../projects/projects/projects.module.js';
import { AgentChatController } from './agent-chat.controller.js';
import { AgentChatService } from './agent-chat.service.js';
import { AgentSettingsStatusController } from './agent-settings-status.controller.js';
import { AgentUsage } from './agent-usage.entity.js';
import { AgentUsageController } from './agent-usage.controller.js';
import { DbAgentUsageSink } from './db-agent-usage-sink.js';

/**
 * `AGENT_USAGE_SINK` is deliberately not provided here: `AgentChatService` injects it `@Optional()` and
 * falls back to `DbAgentUsageSink`. A `@Global()` module exporting `AGENT_USAGE_SINK` (the cloud edition's
 * metering) therefore overrides the community default without touching this module.
 */
@Module({
  controllers: [AgentChatController, AgentSettingsStatusController, AgentUsageController],
  imports: [ProjectsModule, AppSettingsModule, TypeOrmModule.forFeature([AgentUsage])],
  providers: [AgentChatService, DbAgentUsageSink],
})
export class AgentChatModule {}

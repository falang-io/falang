import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSettingsModule } from '../admin/app-settings/app-settings.module.js';
import { ProjectTokenModule } from '../internal-auth/project-token.module.js';
import { Document } from '../projects/documents/document.entity.js';
import { Project } from '../projects/projects/project.entity.js';
import { ProjectsModule } from '../projects/projects/projects.module.js';
import { RunJournalModule } from '../run-journal/run-journal.module.js';
import { UsersModule } from '../users/users/users.module.js';
import { AdminSandboxBotsController } from './admin-sandbox-bots.controller.js';
import { InternalSandboxRelayController } from './internal-sandbox-relay.controller.js';
import { SandboxBindingsService } from './sandbox-bindings.service.js';
import { SandboxBotBinding } from './sandbox-bot-binding.entity.js';
import { SandboxBotLinkCode } from './sandbox-bot-link-code.entity.js';
import { SandboxBotSettingsService } from './sandbox-bot-settings.service.js';
import { SandboxBotsController } from './sandbox-bots.controller.js';
import { SandboxBotsWebhookController } from './sandbox-bots-public.controller.js';
import { SandboxBotsService } from './sandbox-bots.service.js';
import { defaultSandboxIntegrations, SANDBOX_INTEGRATIONS } from './sandbox-integrations.js';
import { SandboxRelayService } from './sandbox-relay.service.js';

/**
 * Sandbox messenger bots (ADR 0073 (private)): the platform's shared test bots, chat bindings, link codes, the dev-target
 * ingress registry and the outbound relay. `SandboxBotsService` is exported for the credential resolver.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SandboxBotBinding, SandboxBotLinkCode, Project, Document]),
    AppSettingsModule,
    ProjectsModule,
    ProjectTokenModule,
    RunJournalModule,
    UsersModule,
  ],
  controllers: [
    AdminSandboxBotsController,
    SandboxBotsController,
    SandboxBotsWebhookController,
    InternalSandboxRelayController,
  ],
  providers: [
    { provide: SANDBOX_INTEGRATIONS, useFactory: defaultSandboxIntegrations },
    SandboxBotSettingsService,
    SandboxBindingsService,
    SandboxBotsService,
    SandboxRelayService,
  ],
  exports: [SandboxBotsService, SandboxBotSettingsService, SANDBOX_INTEGRATIONS],
})
export class SandboxBotsModule {}

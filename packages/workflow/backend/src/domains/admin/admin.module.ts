import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { Project } from '../projects/projects/project.entity.js';
import { MailModule } from '../mail/mail.module.js';
import { UsersModule } from '../users/users/users.module.js';
import { AdminAgentSettingsController } from './app-settings/admin-agent-settings.controller.js';
import { AdminProxySettingsController } from './app-settings/admin-proxy-settings.controller.js';
import { AppSettingsModule } from './app-settings/app-settings.module.js';
import { AdminOAuthCredentialsController } from './oauth-credentials/admin-oauth-credentials.controller.js';
import { OAuthCredentialsModule } from './oauth-credentials/oauth-credentials.module.js';
import { AdminUserLimitsController } from './user-limits/admin-user-limits.controller.js';
import { UserLimitsModule } from './user-limits/user-limits.module.js';
import { AdminUsersController } from './users/admin-users.controller.js';
import { AdminUsersService } from './users/admin-users.service.js';

/**
 * See ADR 0030 (private) — every controller here is
 * `@UseGuards(AdminGuard)`. Imports `IntegrationsModule` (for `ActivepiecesCatalogService`, to build
 * the oauth-credentials admin list) and `OAuthCredentialsModule` directly (for CRUD) rather than
 * relying on `IntegrationsModule` to re-export it — `IntegrationsModule` itself already imports
 * `OAuthCredentialsModule` for its own needs (catalog gating, `oauth2.controller.ts`,
 * `internal-credentials.controller.ts`), so importing it here too creates no cycle: neither
 * `IntegrationsModule` nor `OAuthCredentialsModule` imports anything from `AdminModule`. Also imports
 * `AppSettingsModule` directly (for the "AI agent" settings CRUD) — same reasoning, see
 * ADR 0031 (private). Also imports `UserLimitsModule`
 * directly (for the per-user file/quota limits CRUD) — same reasoning again, see
 * ADR 0038 (private) §2.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Project]),
    UsersModule,
    MailModule,
    IntegrationsModule,
    OAuthCredentialsModule,
    AppSettingsModule,
    UserLimitsModule,
  ],
  controllers: [
    AdminUsersController,
    AdminOAuthCredentialsController,
    AdminAgentSettingsController,
    AdminProxySettingsController,
    AdminUserLimitsController,
  ],
  providers: [AdminUsersService],
})
export class AdminModule {}

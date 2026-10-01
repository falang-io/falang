import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveProjectTokenSecret } from '../../config/validate-secrets.js';
import { InternalAuthController } from './internal-auth.controller.js';
import { ProjectTokenGuard } from './project-token.guard.js';
import { PROJECT_TOKEN_SECRET, ProjectTokenService } from './project-token.service.js';

/**
 * Shared by `BuildModule` (mints tokens, injects them into runner pods), `IntegrationsModule`
 * (checks them on the credential-resolve endpoints) and `TemporalModule` — see `project-token.service.ts`'s
 * doc comment for why this couldn't just live inside one of those.
 */
@Module({
  controllers: [InternalAuthController],
  providers: [
    {
      provide: PROJECT_TOKEN_SECRET,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        resolveProjectTokenSecret(config.get<string>('PROJECT_TOKEN_SECRET'), config.get<string>('NODE_ENV')),
    },
    ProjectTokenService,
    ProjectTokenGuard,
  ],
  exports: [ProjectTokenService, ProjectTokenGuard],
})
export class ProjectTokenModule {}

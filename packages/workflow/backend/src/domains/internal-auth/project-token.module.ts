import { Module } from '@nestjs/common';
import { ProjectTokenGuard } from './project-token.guard.js';
import { ProjectTokenService } from './project-token.service.js';

/**
 * Shared by `BuildModule` (mints tokens, injects them into runner pods) and `IntegrationsModule`
 * (checks them on the credential-resolve endpoints) — see `project-token.service.ts`'s doc comment
 * for why this couldn't just live inside one of those two.
 */
@Module({
  providers: [ProjectTokenService, ProjectTokenGuard],
  exports: [ProjectTokenService, ProjectTokenGuard],
})
export class ProjectTokenModule {}

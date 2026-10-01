import { Controller, HttpCode, Inject, NotFoundException, Optional, Param, Post, UseGuards } from '@nestjs/common';
import { Public } from '../auth/auth/public.decorator.js';
import { ProjectTokenGuard } from '../internal-auth/project-token.guard.js';
import { TemporalTokenService, type ITemporalToken } from './temporal-token.service.js';

/**
 * A runner pod's way to get (and, every half-TTL, refresh) the Temporal JWT for its own namespace — ADR 0050 (private).
 * Guarded by `ProjectTokenGuard` (the pod's `INTERNAL_PROJECT_TOKEN` against the `:projectId` route
 * param): the namespace and `sub` in the minted token come from that param, i.e. from the project the
 * caller proved it is — never from the body. Internal port only (`port-split.ts`).
 */
@Public()
@UseGuards(ProjectTokenGuard)
@Controller('internal/projects')
export class TemporalTokenController {
  private readonly tokens: TemporalTokenService | null;

  constructor(@Optional() @Inject(TemporalTokenService) tokens: TemporalTokenService | null) {
    this.tokens = tokens;
  }

  @Post(':projectId/temporal-token')
  @HttpCode(200)
  mint(@Param('projectId') projectId: string): ITemporalToken {
    if (!this.tokens) throw new NotFoundException('Temporal tenant isolation is not enabled');
    return this.tokens.mintProjectToken(projectId);
  }
}

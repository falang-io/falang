import { Controller, Get, Header, Inject, NotFoundException, Optional } from '@nestjs/common';
import { Public } from '../auth/auth/public.decorator.js';
import { TemporalTokenService } from './temporal-token.service.js';
import type { IJwks } from './temporal-jwt.js';

/**
 * Public keys Temporal's `jwtKeyProvider` (`keySourceURIs`) polls to verify the tokens
 * `TemporalTokenService` signs — ADR 0050 (private). Unauthenticated by design (public keys), reachable
 * only on the cluster-internal port: `/internal/*` is not served by the public listener (`port-split.ts`).
 * `404` when tenant isolation is off (`shared` mode has no signing key and Temporal has no authorizer).
 */
@Public()
@Controller('internal/temporal')
export class JwksController {
  private readonly tokens: TemporalTokenService | null;

  constructor(@Optional() @Inject(TemporalTokenService) tokens: TemporalTokenService | null) {
    this.tokens = tokens;
  }

  @Get('jwks.json')
  @Header('cache-control', 'no-store')
  getJwks(): IJwks {
    if (!this.tokens) throw new NotFoundException('Temporal tenant isolation is not enabled');
    return this.tokens.getJwks();
  }
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

/** DI token for the HMAC key (`PROJECT_TOKEN_SECRET`) project tokens are derived from. */
export const PROJECT_TOKEN_SECRET = Symbol('PROJECT_TOKEN_SECRET');

/**
 * Per-project scoped internal-API token — see
 * ADR 0016 (private)'s "Namespace/RBAC model and inter-pod auth":
 * `NetworkPolicy` alone isn't the trust boundary between a runner pod and `backend`'s internal
 * routes, an application-level token checked on the receiving side is. A pod receives its project's
 * token as an env var at create time; the artifact-fetch endpoints (`internal-artifacts.controller.ts`),
 * the credential-resolve endpoints (`internal-credentials.controller.ts`, also reached indirectly via
 * the standalone `activepieces` service), the Temporal-token endpoint (`temporal-token.controller.ts`,
 * ADR 0057 (private)) and the other internal controllers all check it via `ProjectTokenGuard`. A leaked
 * token only exposes the one project's data, not every tenant's.
 *
 * Deterministic and stateless since ADR 0057 (private): the token is `HMAC-SHA256(PROJECT_TOKEN_SECRET,
 * projectId)` (hex) — it survives a `backend` restart and is the same on every replica, which a pod
 * needs to keep refreshing its Temporal token after the backend restarts. No rotation (changing the
 * secret invalidates every token; pods get fresh ones on their next `start()`).
 *
 * Lives in its own module (`project-token.module.ts`), not inside the `build` domain it was
 * originally written for — `IntegrationsModule` needs it too, and `BuildModule` already imports
 * `IntegrationsModule`, so a shared module avoids a circular import between the two.
 */
@Injectable()
export class ProjectTokenService {
  private readonly secret: string;

  constructor(@Inject(PROJECT_TOKEN_SECRET) secret: string) {
    this.secret = secret;
  }

  getOrCreateToken(projectId: string): string {
    return createHmac('sha256', this.secret).update(projectId).digest('hex');
  }

  verify(projectId: string, token: string | undefined): boolean {
    if (!token || !projectId) return false;
    const expected = Buffer.from(this.getOrCreateToken(projectId));
    const actual = Buffer.from(token);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}

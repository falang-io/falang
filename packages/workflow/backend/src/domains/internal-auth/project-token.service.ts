import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * Per-project scoped internal-API token — see
 * ADR 0016 (private)'s "Namespace/RBAC model and inter-pod auth":
 * `NetworkPolicy` alone isn't the trust boundary between a runner pod and `backend`'s internal
 * routes, an application-level token checked on the receiving side is. `backend` mints one token
 * per project (v1 issuance: plain env var into the pod at create time, no k8s `Secret` object, no
 * rotation — see the ADR) and hands it to `RunnerProcessManager` to inject into that project's
 * runner pods; both the artifact-fetch endpoints (`internal-artifacts.controller.ts`, checked
 * against the `:projectId` route param) and the credential-resolve endpoints
 * (`internal-credentials.controller.ts`, checked against the request body's `projectId` — the same
 * token also reaches `backend` indirectly via the standalone `activepieces` service, which forwards
 * whatever a runner pod or `backend`'s own poll loop handed it) check it via `ProjectTokenGuard`.
 *
 * Lives in its own module (`project-token.module.ts`), not inside the `build` domain it was
 * originally written for — `IntegrationsModule` needs it too, and `BuildModule` already imports
 * `IntegrationsModule`, so a shared module avoids a circular import between the two.
 *
 * In-memory, like `ProjectStore`/`DevArtifactStore` — tokens don't survive a `backend` restart,
 * same MVP tradeoff the ADR already accepts for v1 issuance (no rotation either). A pod started
 * before a restart keeps whatever token it was created with; a fresh `start()` after the restart
 * mints (and hands out) a new one for that project, so a stale pod's *old* token simply stops
 * working — acceptable since `start()` always replaces that project's pod anyway.
 */
@Injectable()
export class ProjectTokenService {
  private readonly tokensByProjectId = new Map<string, string>();

  getOrCreateToken(projectId: string): string {
    const existing = this.tokensByProjectId.get(projectId);
    if (existing) return existing;
    const token = randomBytes(32).toString('hex');
    this.tokensByProjectId.set(projectId, token);
    return token;
  }

  verify(projectId: string, token: string | undefined): boolean {
    if (!token) return false;
    return this.tokensByProjectId.get(projectId) === token;
  }
}

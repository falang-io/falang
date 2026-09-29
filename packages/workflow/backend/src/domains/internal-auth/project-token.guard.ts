import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ProjectTokenService } from './project-token.service.js';

export const INTERNAL_PROJECT_TOKEN_HEADER = 'x-internal-project-token';

interface IRequestWithProjectId {
  readonly params: Readonly<Record<string, string | undefined>>;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly body: unknown;
}

/**
 * Guards every internal endpoint a runner pod (directly, or indirectly via the standalone
 * `activepieces` service — see ADR 0016 (private)'s "Namespace/RBAC
 * model and inter-pod auth") calls back into `backend` with: the artifact-fetch endpoints
 * (`internal-artifacts.controller.ts`, `:projectId` route param) and the credential-resolve
 * endpoints (`internal-credentials.controller.ts`, `projectId` in the JSON body — there's no route
 * param there, it's a flat `POST`). Checks whichever of the two carries a `projectId`, preferring
 * the route param when both happen to be present. A leaked token only exposes the one project's
 * artifacts/credentials, not every tenant's — unlike the single shared secret this replaced
 * (`InternalApiGuard`, removed once both endpoint families migrated to this).
 */
@Injectable()
export class ProjectTokenGuard implements CanActivate {
  private readonly tokens: ProjectTokenService;

  constructor(@Inject(ProjectTokenService) tokens: ProjectTokenService) {
    this.tokens = tokens;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IRequestWithProjectId>();
    const projectId = request.params['projectId'] ?? (request.body as { projectId?: string } | undefined)?.projectId;
    if (!projectId) return false;
    const header = request.headers[INTERNAL_PROJECT_TOKEN_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    return this.tokens.verify(projectId, token);
  }
}

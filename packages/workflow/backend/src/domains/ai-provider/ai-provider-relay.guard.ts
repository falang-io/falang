import { HttpStatus, Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { INTERNAL_PROJECT_TOKEN_HEADER } from '../internal-auth/project-token.guard.js';
import { ProjectTokenService } from '../internal-auth/project-token.service.js';
import { aiProviderRelayError } from './ai-provider-relay-errors.js';

interface IRelayRequest {
  readonly params: Readonly<Record<string, string | undefined>>;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
}

const firstHeader = (value: string | readonly string[] | undefined): string | undefined =>
  Array.isArray(value) ? (value as readonly string[])[0] : (value as string | undefined);

/** The project token a pod sent: `Authorization: Bearer <token>` (the OpenAI activity uses its "API key" so) or the usual header. */
export const readRelayToken = (headers: IRelayRequest['headers']): string | undefined => {
  const authorization = firstHeader(headers.authorization);
  const bearer = /^Bearer\s+(\S+)\s*$/iu.exec(authorization ?? '')?.[1];
  return bearer ?? firstHeader(headers[INTERNAL_PROJECT_TOKEN_HEADER]);
};

/**
 * `ProjectTokenGuard` semantics for the AI provider relay (ADR 0081 (private)): the token must be the route's
 * `projectId`'s. Answers 401 in the relay's error shape instead of Nest's bare 403, so the activity shows a reason.
 */
@Injectable()
export class AiProviderRelayGuard implements CanActivate {
  private readonly tokens: ProjectTokenService;

  constructor(@Inject(ProjectTokenService) tokens: ProjectTokenService) {
    this.tokens = tokens;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IRelayRequest>();
    const projectId = request.params['projectId'];
    if (!projectId || !this.tokens.verify(projectId, readRelayToken(request.headers))) {
      throw aiProviderRelayError(
        HttpStatus.UNAUTHORIZED,
        'invalid_project_token',
        'Missing or invalid project token for this project',
      );
    }
    return true;
  }
}

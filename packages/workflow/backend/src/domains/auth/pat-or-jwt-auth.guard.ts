import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { AuthGuard, type IAuthGuard } from '@nestjs/passport';
import type { IJwtPayloadUser } from './auth/jwt.strategy.js';
import { PersonalAccessTokensService } from './personal-access-tokens/personal-access-tokens.service.js';

const PAT_PREFIX = 'flg_pat_';

interface IRequestWithAuth {
  headers: Readonly<Record<string, string | undefined>>;
  user?: IJwtPayloadUser;
  /** Set only when the request authenticated with a project-scoped PAT — see `assertProjectScope`. */
  patProjectScope?: string | null;
}

const extractBearerToken = (request: IRequestWithAuth): string | null => {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
};

/**
 * Accepts either a real JWT (delegated to the existing passport `'jwt'` strategy, same as
 * `JwtAuthGuard`) or a personal access token (`Bearer flg_pat_…`, detected by prefix so we never
 * try to JWT-verify a PAT or vice versa). Sets `request.user` to the same `IJwtPayloadUser` shape
 * either way, plus `request.patProjectScope` when a project-scoped PAT authenticated the request —
 * `null` for an unscoped PAT, left `undefined` entirely for a JWT (there is no such thing as a
 * "project-scoped JWT" in this app).
 *
 * v1 scope (ADR 0029 (private), phase C): this guard is written and unit
 * tested here but not yet applied to any route — phase F (`/mcp`) is its first real caller. Existing
 * routes keep using the global `JwtAuthGuard` unchanged.
 */
@Injectable()
export class PatOrJwtAuthGuard implements CanActivate {
  private readonly jwtGuard: IAuthGuard;
  private readonly tokensService: PersonalAccessTokensService;

  constructor(@Inject(PersonalAccessTokensService) tokensService: PersonalAccessTokensService) {
    this.tokensService = tokensService;
    // `AuthGuard('jwt')` returns a class; instantiate it directly rather than going through Nest's
    // DI (it has no constructor dependencies of its own — the passport strategy it delegates to is
    // already registered globally via `JwtStrategy`).
    const JwtGuardClass = AuthGuard('jwt');
    this.jwtGuard = new JwtGuardClass();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<IRequestWithAuth>();
    const token = extractBearerToken(request);
    if (token?.startsWith(PAT_PREFIX)) return this.activateWithPat(token, request);
    return this.jwtGuard.canActivate(context) as boolean | Promise<boolean>;
  }

  private async activateWithPat(token: string, request: IRequestWithAuth): Promise<boolean> {
    const resolved = await this.tokensService.resolve(token);
    if (!resolved) throw new UnauthorizedException('Invalid or expired personal access token');
    request.user = resolved.user;
    request.patProjectScope = resolved.projectScope;
    return true;
  }
}

/**
 * Throws 403 when a project-scoped PAT (`request.patProjectScope` not `null`/`undefined`) is used
 * against a different project than it's scoped to. A no-op for a JWT-authenticated request or an
 * unscoped PAT (`patProjectScope` is `undefined`/`null` respectively).
 */
export const assertProjectScope = (request: IRequestWithAuth, projectId: string): void => {
  if (request.patProjectScope && request.patProjectScope !== projectId) {
    throw new ForbiddenException(`This token is scoped to a different project than "${projectId}"`);
  }
};

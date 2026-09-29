import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PatOrJwtAuthGuard, assertProjectScope } from './pat-or-jwt-auth.guard.js';
import type { PersonalAccessTokensService } from './personal-access-tokens/personal-access-tokens.service.js';

const { jwtCanActivate } = vi.hoisted(() => ({ jwtCanActivate: vi.fn() }));

// `AuthGuard('jwt')`'s real implementation needs a `JwtStrategy` registered with passport globally
// (only true inside a booted Nest app) — replaced here with a controllable fake so the delegation
// path can be unit tested without booting the whole app, the same reasoning `ScriptedLlmClient`
// exists for `@falang/agent`.
vi.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class {
      canActivate = jwtCanActivate;
    },
}));

const makeContext = (
  headers: Record<string, string> = {},
): { context: ExecutionContext; request: Record<string, unknown> } => {
  const request: Record<string, unknown> = { headers };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { context, request };
};

describe('PatOrJwtAuthGuard', () => {
  // oxlint-disable-next-line init-declarations
  let tokensService: Pick<PersonalAccessTokensService, 'resolve'>;
  // oxlint-disable-next-line init-declarations
  let guard: PatOrJwtAuthGuard;

  beforeEach(() => {
    jwtCanActivate.mockReset();
    tokensService = { resolve: vi.fn() };
    guard = new PatOrJwtAuthGuard(tokensService as PersonalAccessTokensService);
  });

  it('delegates a real JWT bearer token to the passport jwt guard', async () => {
    jwtCanActivate.mockResolvedValue(true);
    const { context } = makeContext({ authorization: 'Bearer some.jwt.token' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(jwtCanActivate).toHaveBeenCalledWith(context);
    expect(tokensService.resolve).not.toHaveBeenCalled();
  });

  it('delegates a request with no Authorization header to the passport jwt guard', async () => {
    jwtCanActivate.mockResolvedValue(false);
    const { context } = makeContext();

    const result = await guard.canActivate(context);

    expect(result).toBe(false);
  });

  it('accepts a valid PAT, sets request.user/patProjectScope, and never touches the jwt guard', async () => {
    const resolved = {
      user: { id: 'user-1', username: 'admin', role: 'user' as const },
      projectScope: 'project-1',
      tokenId: 'pat-1',
    };
    vi.mocked(tokensService.resolve).mockResolvedValue(resolved);
    const { context, request } = makeContext({ authorization: 'Bearer flg_pat_abc123' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual(resolved.user);
    expect(request.patProjectScope).toBe('project-1');
    expect(jwtCanActivate).not.toHaveBeenCalled();
  });

  it('accepts an unscoped PAT with patProjectScope null', async () => {
    vi.mocked(tokensService.resolve).mockResolvedValue({
      user: { id: 'user-1', username: 'admin', role: 'user' as const },
      projectScope: null,
      tokenId: 'pat-1',
    });
    const { context, request } = makeContext({ authorization: 'Bearer flg_pat_abc123' });

    await guard.canActivate(context);

    expect(request.patProjectScope).toBe(null);
  });

  it('rejects an unknown/revoked/expired PAT', async () => {
    vi.mocked(tokensService.resolve).mockResolvedValue(null);
    const { context } = makeContext({ authorization: 'Bearer flg_pat_bad' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});

describe('assertProjectScope', () => {
  it('allows a JWT-authenticated request (no patProjectScope field at all)', () => {
    expect(() => assertProjectScope({ headers: {} }, 'project-1')).not.toThrow();
  });

  it('allows an unscoped PAT (patProjectScope: null) against any project', () => {
    expect(() => assertProjectScope({ headers: {}, patProjectScope: null }, 'project-2')).not.toThrow();
  });

  it('allows a project-scoped PAT matching the requested project', () => {
    expect(() => assertProjectScope({ headers: {}, patProjectScope: 'project-1' }, 'project-1')).not.toThrow();
  });

  it('rejects a project-scoped PAT used against a different project', () => {
    expect(() => assertProjectScope({ headers: {}, patProjectScope: 'project-1' }, 'project-2')).toThrow(
      ForbiddenException,
    );
  });
});

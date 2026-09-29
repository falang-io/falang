import { describe, expect, it, vi } from 'vitest';
import type { PersonalAccessTokensService } from '../auth/personal-access-tokens/personal-access-tokens.service.js';
import { assertMcpProjectScope, resolveMcpAuth, type IMcpAuthContext } from './mcp-auth.js';

const makeTokensService = (
  resolve: PersonalAccessTokensService['resolve'],
): Pick<PersonalAccessTokensService, 'resolve'> => ({ resolve });

describe('resolveMcpAuth', () => {
  it('returns null when the Authorization header is missing', async () => {
    const tokensService = makeTokensService(vi.fn());
    // Exercising the "header absent" branch, whose real caller (Express's
    // `req.headers.authorization`) is genuinely `undefined` when unset.
    // oxlint-disable-next-line no-undefined
    expect(await resolveMcpAuth(undefined, tokensService)).toBeNull();
    expect(tokensService.resolve).not.toHaveBeenCalled();
  });

  it('returns null when the header is not a Bearer token', async () => {
    const tokensService = makeTokensService(vi.fn());
    expect(await resolveMcpAuth('Basic abc123', tokensService)).toBeNull();
  });

  it('returns null for a JWT (not PAT-prefixed) — this route is PAT-only', async () => {
    const tokensService = makeTokensService(vi.fn());
    expect(await resolveMcpAuth('Bearer eyJhbGciOiJIUzI1NiJ9.fake.jwt', tokensService)).toBeNull();
    expect(tokensService.resolve).not.toHaveBeenCalled();
  });

  it('returns null for an unknown/expired/revoked PAT (resolve() returns null)', async () => {
    const tokensService = makeTokensService(vi.fn().mockResolvedValue(null));
    expect(await resolveMcpAuth('Bearer flg_pat_bad', tokensService)).toBeNull();
  });

  it('resolves a valid PAT into an auth context with the "pat:<tokenId>" owner string', async () => {
    const tokensService = makeTokensService(
      vi
        .fn()
        .mockResolvedValue({
          user: { id: 'user-1', username: 'admin', role: 'user' as const },
          projectScope: null,
          tokenId: 'pat-1',
        }),
    );
    const auth = await resolveMcpAuth('Bearer flg_pat_good', tokensService);
    expect(auth).toEqual({
      user: { id: 'user-1', username: 'admin', role: 'user' as const },
      projectScope: null,
      owner: 'pat:pat-1',
    });
  });

  it('carries a project scope through', async () => {
    const tokensService = makeTokensService(
      vi
        .fn()
        .mockResolvedValue({
          user: { id: 'user-1', username: 'admin', role: 'user' as const },
          projectScope: 'project-1',
          tokenId: 'pat-2',
        }),
    );
    const auth = await resolveMcpAuth('Bearer flg_pat_scoped', tokensService);
    expect(auth?.projectScope).toBe('project-1');
    expect(auth?.owner).toBe('pat:pat-2');
  });
});

describe('assertMcpProjectScope', () => {
  const unscoped: IMcpAuthContext = {
    user: { id: 'user-1', username: 'admin', role: 'user' as const },
    projectScope: null,
    owner: 'pat:1',
  };
  const scoped: IMcpAuthContext = {
    user: { id: 'user-1', username: 'admin', role: 'user' as const },
    projectScope: 'project-1',
    owner: 'pat:2',
  };

  it('never throws for an unscoped token', () => {
    expect(() => assertMcpProjectScope(unscoped, 'project-1')).not.toThrow();
    expect(() => assertMcpProjectScope(unscoped, 'project-2')).not.toThrow();
  });

  it('does not throw when a scoped token matches the requested project', () => {
    expect(() => assertMcpProjectScope(scoped, 'project-1')).not.toThrow();
  });

  it('throws when a scoped token is used against a different project', () => {
    expect(() => assertMcpProjectScope(scoped, 'project-2')).toThrow(/scoped to a different project/);
  });
});

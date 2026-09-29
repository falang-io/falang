import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
import type { PersonalAccessTokensService } from '../auth/personal-access-tokens/personal-access-tokens.service.js';

/**
 * `/mcp`'s own auth context — resolved once per request and closed over by every tool handler
 * registered for that request (see `mcp.service.ts`). `owner` is the document-lock owner string per
 * ADR 0029 (private)'s "Contract clarifications" §4: `"pat:<tokenId>"`,
 * stable across MCP sessions of the same token (two sessions on one token share a lock; two tokens
 * conflict, as they should).
 */
export interface IMcpAuthContext {
  readonly user: IJwtPayloadUser;
  readonly projectScope: string | null;
  readonly owner: string;
}

const BEARER_PREFIX = 'Bearer ';
const PAT_PREFIX = 'flg_pat_';

/**
 * PAT-only (ADR 0029 (private)'s decision 6) — deliberately does not
 * delegate to `PatOrJwtAuthGuard` (which also accepts a JWT): a JWT or a missing/malformed header is
 * rejected here, before the SDK's transport ever sees the request, same as an unknown/expired/revoked
 * PAT. Returns `null` for every rejection reason — the caller (the raw Express route) turns that into
 * one uniform 401, never leaking which specific reason applied.
 */
export const resolveMcpAuth = async (
  authorizationHeader: string | undefined,
  tokensService: Pick<PersonalAccessTokensService, 'resolve'>,
): Promise<IMcpAuthContext | null> => {
  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) return null;
  const token = authorizationHeader.slice(BEARER_PREFIX.length);
  if (!token.startsWith(PAT_PREFIX)) return null;

  const resolved = await tokensService.resolve(token);
  if (!resolved) return null;
  return { user: resolved.user, projectScope: resolved.projectScope, owner: `pat:${resolved.tokenId}` };
};

/**
 * Throws (as a plain `Error` — tool handlers catch it and translate it into an `isError` tool result,
 * see `mcp-tool-result.ts`'s `withToolErrors`) when `auth` is a project-scoped PAT and `projectId`
 * doesn't match — mirrors `pat-or-jwt-auth.guard.ts`'s `assertProjectScope`, reimplemented here rather
 * than imported since that one throws a Nest `ForbiddenException` (meaningless outside Nest's own
 * exception filter — this route never reaches one, see `mcp.service.ts`).
 */
export const assertMcpProjectScope = (auth: IMcpAuthContext, projectId: string): void => {
  if (auth.projectScope && auth.projectScope !== projectId) {
    throw new Error(`This token is scoped to a different project than "${projectId}"`);
  }
};

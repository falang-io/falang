import { createHash } from 'node:crypto';

export const INTERNAL_PROJECT_TOKEN_HEADER = 'x-internal-project-token';

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 1000;

/** `ok`: `backend` confirmed the token belongs to the project; `denied`: it did not; `unavailable`:
 * `backend` could not be asked (callers fail closed). */
export type TTokenVerdict = 'ok' | 'denied' | 'unavailable';

export type TProjectTokenVerifier = (projectId: string, token: string) => Promise<TTokenVerdict>;

export interface IProjectTokenVerifierOptions {
  readonly backendInternalUrl: string;
  readonly fetchFn?: typeof fetch;
  readonly now?: () => number;
}

/** Verifies `(projectId, token)` against `backend`'s `POST /internal/auth/verify-project-token`
 * (same contract the ActivePieces service uses): positive answers are cached for 60 s (<= 1000
 * entries, keyed by a hash so raw tokens never sit in the map), a wrong token is 'denied', and an
 * unreachable/misconfigured backend is 'unavailable' — never a pass-through. */
export const createProjectTokenVerifier = (options: IProjectTokenVerifierOptions): TProjectTokenVerifier => {
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? Date.now;
  const verified = new Map<string, number>();

  const remember = (key: string, at: number): void => {
    if (verified.size >= CACHE_MAX_ENTRIES) {
      for (const [k, expiresAt] of verified) if (expiresAt <= at) verified.delete(k);
      while (verified.size >= CACHE_MAX_ENTRIES) {
        const oldest = verified.keys().next();
        if (oldest.done) break;
        verified.delete(oldest.value);
      }
    }
    verified.set(key, at + CACHE_TTL_MS);
  };

  return async (projectId, token) => {
    const key = createHash('sha256').update(projectId).update('\0').update(token).digest('hex');
    const at = now();
    const cachedUntil = verified.get(key);
    if (typeof cachedUntil === 'number' && cachedUntil > at) return 'ok';
    if (!options.backendInternalUrl) return 'unavailable';
    try {
      const response = await fetchFn(`${options.backendInternalUrl}/internal/auth/verify-project-token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [INTERNAL_PROJECT_TOKEN_HEADER]: token },
        body: JSON.stringify({ projectId }),
      });
      if (response.ok) {
        remember(key, at);
        return 'ok';
      }
      verified.delete(key);
      // 401/403/404 mean "not this project's token"; anything else (5xx) is backend trouble.
      return response.status >= 500 ? 'unavailable' : 'denied';
    } catch {
      return 'unavailable';
    }
  };
};

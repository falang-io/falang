import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const INTERNAL_PROJECT_TOKEN_HEADER = 'x-internal-project-token';

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 1000;

/** Verified `(projectId, token)` pairs -> expiry. Keyed by a hash so raw tokens never sit in the map. */
const verified = new Map<string, number>();

const cacheKey = (projectId: string, token: string): string =>
  createHash('sha256').update(projectId).update('\0').update(token).digest('hex');

/** Test hook. */
export const clearProjectTokenCache = (): void => verified.clear();

const remember = (key: string, now: number): void => {
  if (verified.size >= CACHE_MAX_ENTRIES) {
    for (const [k, expiresAt] of verified) if (expiresAt <= now) verified.delete(k);
    // Still full: drop the oldest insertion (Map keeps insertion order).
    while (verified.size >= CACHE_MAX_ENTRIES) {
      const oldest = verified.keys().next();
      if (oldest.done) break;
      verified.delete(oldest.value);
    }
  }
  verified.set(key, now + CACHE_TTL_MS);
};

const verifyWithBackend = async (projectId: string, token: string): Promise<boolean> => {
  const backendUrl = process.env.BACKEND_INTERNAL_URL;
  if (!backendUrl) throw new Error('BACKEND_INTERNAL_URL is not configured');
  const response = await fetch(`${backendUrl}/internal/auth/verify-project-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [INTERNAL_PROJECT_TOKEN_HEADER]: token },
    body: JSON.stringify({ projectId }),
  });
  return response.ok;
};

/**
 * Guard for the routes a runner pod calls (action `run`): the caller proves it is project `projectId`
 * with its own per-project token (`x-internal-project-token`), checked against `backend` — no shared
 * secret ever reaches a runner pod. `projectId` comes from the JSON body; the verified value is the
 * one every later step uses (`res.locals.internalProjectToken` is the verified token), so a token of
 * project A can never act as project B. Fails closed: backend unreachable -> 503, bad token -> 401.
 */
export const requireProjectToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const projectId = (req.body as { projectId?: unknown } | undefined)?.projectId;
  const token = req.header(INTERNAL_PROJECT_TOKEN_HEADER);
  if (typeof projectId !== 'string' || !projectId || !token) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const key = cacheKey(projectId, token);
  const now = Date.now();
  const cachedUntil = verified.get(key);
  if (cachedUntil !== undefined && cachedUntil > now) {
    res.locals['internalProjectToken'] = token;
    next();
    return;
  }
  try {
    if (!(await verifyWithBackend(projectId, token))) {
      verified.delete(key);
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
  } catch {
    res.status(503).json({ message: 'Project token verification unavailable' });
    return;
  }
  remember(key, now);
  res.locals['internalProjectToken'] = token;
  next();
};

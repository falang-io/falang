import type { NextFunction, Request, Response } from 'express';

/** `/internal/*` in any spelling Express's (case-insensitive, non-strict) router would still route to the controllers. */
const isInternalPath = (path: string): boolean => {
  const candidates = [path];
  try {
    candidates.push(decodeURIComponent(path));
  } catch {
    // an undecodable path never matches a route anyway
  }
  return candidates.some((candidate) => /^\/+internal(\/|$)/i.test(candidate));
};

const isHealthPath = (path: string): boolean => /^\/+health\/?$/i.test(path);

const notFound = (req: Request, res: Response): void => {
  res.status(404).json({ statusCode: 404, message: `Cannot ${req.method} ${req.path}`, error: 'Not Found' });
};

/**
 * Splits one Express app across two listeners (ADR security audit P0-8): `/internal/*` (runner pods,
 * `activepieces`, `media` — guarded by `ProjectTokenGuard`) is served only on `internalPort`, so the
 * public ingress, which exposes only the public port, never reaches it. Anything on the internal
 * port other than `/internal/*` and `/health` is a 404. Requests on any other local port (e.g. the
 * public one, or a supertest ephemeral port) are treated as public.
 */
export const portSplitMiddleware =
  (internalPort: number) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const onInternalPort = req.socket.localPort === internalPort;
    const internalPath = isInternalPath(req.path);
    if (onInternalPort) {
      if (internalPath || isHealthPath(req.path)) return next();
      return notFound(req, res);
    }
    if (internalPath) return notFound(req, res);
    return next();
  };

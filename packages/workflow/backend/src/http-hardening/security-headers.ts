import type { NextFunction, Request, Response } from 'express';

const DEFAULT_CSP = "default-src 'none'; frame-ancestors 'none'";
const HSTS = 'max-age=15552000; includeSubDomains';

/**
 * Dependency-free replacement for helmet's relevant subset, for every public response. Headers are set up
 * front with `setHeader`, so a route that sets its own value (the OAuth2 callback page's CSP) simply overrides it.
 * No `Cross-Origin-Resource-Policy`: public files are loaded from another host.
 */
export const securityHeadersMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', DEFAULT_CSP);
  // `req.secure` honours `trust proxy` (X-Forwarded-Proto).
  if (req.secure) res.setHeader('Strict-Transport-Security', HSTS);
  next();
};

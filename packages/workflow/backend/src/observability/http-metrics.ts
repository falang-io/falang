import type { NextFunction, Request, Response } from 'express';
import { httpRequestDuration, httpRequestsTotal } from '../domains/metrics/metrics.js';

const isIgnored = (path: string): boolean => /^\/+(internal\/metrics|health)\/?$/i.test(path);

/** The matched route template (`/projects/:id`), never the raw URL; `unmatched` when no route matched. */
export const routeTemplate = (req: Request): string => {
  const routePath: unknown = req.route && (req.route as { path?: unknown }).path;
  if (typeof routePath === 'string') return `${req.baseUrl}${routePath}` || '/';
  return 'unmatched';
};

/** Counts requests and times them per method/route-template/status (ADR 0060 (private)). Installed before the routes, incl. the raw `/mcp` mount. */
export const httpMetricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (isIgnored(req.path)) return next();
  const startedAt = process.hrtime.bigint();
  res.once('finish', () => {
    const route = routeTemplate(req);
    httpRequestsTotal.inc({ method: req.method, route, status: String(res.statusCode) });
    httpRequestDuration.observe({ method: req.method, route }, Number(process.hrtime.bigint() - startedAt) / 1e9);
  });
  next();
};

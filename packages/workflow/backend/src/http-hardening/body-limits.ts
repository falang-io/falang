import express from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const DEFAULT_BODY_LIMIT = '256kb';
export const LARGE_BODY_LIMIT = '15mb';

/**
 * Routes that legitimately carry big JSON bodies (project import, whole documents, agent conversations and the
 * client's live trees, template payloads, MCP `set_document`). The internal API (coverage, journal ingest, …) is
 * never reachable on the public port, so it is simply allowed the large limit everywhere.
 */
const LARGE_BODY_PATHS: readonly RegExp[] = [
  /^\/+projects\/import\/?$/i,
  /^\/+projects\/[^/]+\/documents(\/[^/]+)?\/?$/i,
  /^\/+projects\/[^/]+\/agent\/(chat|check-project)\/?$/i,
  /^\/+admin\/project-templates(\/.*)?$/i,
  /^\/+mcp(\/.*)?$/i,
  /^\/+internal(\/|$)/i,
];

export const needsLargeBody = (path: string): boolean => LARGE_BODY_PATHS.some((pattern) => pattern.test(path));

const captureRawBody = (req: Request & { rawBody?: Buffer }, _res: Response, buf: Buffer): void => {
  req.rawBody = buf;
};

/**
 * Parses JSON/urlencoded bodies for the routes in {@link LARGE_BODY_PATHS} with the large limit, before Nest's
 * own (256 KB) parsers: body-parser skips a request that is already parsed. `rawBody` is captured exactly as
 * Nest's `rawBody: true` does.
 */
export const largeBodyMiddleware = (): RequestHandler => {
  const json = express.json({ limit: LARGE_BODY_LIMIT, verify: captureRawBody });
  const urlencoded = express.urlencoded({ extended: true, limit: LARGE_BODY_LIMIT, verify: captureRawBody });
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!needsLargeBody(req.path)) return next();
    json(req, res, (error?: unknown) => (error ? next(error) : urlencoded(req, res, next)));
  };
};

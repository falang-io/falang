import express from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const DEFAULT_BODY_LIMIT = '256kb';
export const LARGE_BODY_LIMIT = '15mb';
/**
 * The built-in AI provider relay (ADR 0081 (private)): a chat request carries attachments as base64 data URLs of up to
 * `AI_ATTACHMENT_MAX_BYTES` (20 MiB each) — over the 15 MB large limit. Internal port only.
 */
export const AI_PROVIDER_BODY_LIMIT = '30mb';

const AI_PROVIDER_BODY_PATH = /^\/+internal\/ai-provider(\/|$)/i;

/**
 * Routes that legitimately carry big JSON bodies (project import, whole documents, agent conversations and the
 * client's live trees, template payloads, MCP `set_document`). The internal API (coverage, journal ingest, …) is
 * never reachable on the public port, so it is simply allowed the large limit everywhere.
 */
const LARGE_BODY_PATHS: readonly RegExp[] = [
  /^\/+projects\/import\/?$/i,
  /^\/+projects\/[^/]+\/documents(\/[^/]+)?\/?$/i,
  /^\/+projects\/[^/]+\/agent\/(chat|check-project)\/?$/i,
  /^\/+projects\/[^/]+\/tables\/[^/]+\/(import\.csv|files)\/?$/i,
  /^\/+admin\/project-templates(\/.*)?$/i,
  /^\/+mcp(\/.*)?$/i,
  /^\/+internal(\/|$)/i,
];

export const needsLargeBody = (path: string): boolean => LARGE_BODY_PATHS.some((pattern) => pattern.test(path));

/** The raised JSON/urlencoded limit for `path`, or `null` for the default (256 KB). */
export const bodyLimitFor = (path: string): string | null => {
  if (AI_PROVIDER_BODY_PATH.test(path)) return AI_PROVIDER_BODY_LIMIT;
  return needsLargeBody(path) ? LARGE_BODY_LIMIT : null;
};

const captureRawBody = (req: Request & { rawBody?: Buffer }, _res: Response, buf: Buffer): void => {
  req.rawBody = buf;
};

const createParsers = (limit: string): { json: RequestHandler; urlencoded: RequestHandler } => ({
  json: express.json({ limit, verify: captureRawBody }),
  urlencoded: express.urlencoded({ extended: true, limit, verify: captureRawBody }),
});

/**
 * Parses JSON/urlencoded bodies for the routes in {@link LARGE_BODY_PATHS} with the large limit (and the AI provider
 * relay with {@link AI_PROVIDER_BODY_LIMIT}), before Nest's own (256 KB) parsers: body-parser skips a request that is
 * already parsed. `rawBody` is captured exactly as Nest's `rawBody: true` does.
 */
export const largeBodyMiddleware = (): RequestHandler => {
  const parsers = new Map([LARGE_BODY_LIMIT, AI_PROVIDER_BODY_LIMIT].map((limit) => [limit, createParsers(limit)]));
  return (req: Request, res: Response, next: NextFunction): void => {
    const limit = bodyLimitFor(req.path);
    const parser = limit === null ? null : (parsers.get(limit) ?? null);
    if (!parser) return next();
    parser.json(req, res, (error?: unknown) => (error ? next(error) : parser.urlencoded(req, res, next)));
  };
};

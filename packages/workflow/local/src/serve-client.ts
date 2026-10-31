import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

/** Same pattern as the Vite dev server in `packages/workflow/client/vite.config.ts`. */
export const ADMIN_ROUTE_PATTERN = /^\/admin(\/[^.]*)?$/;

/**
 * Express middleware serving the built workflow client (two entries, `index.html` and `admin.html`) from the
 * backend's own port. The pages are handed out only to browser navigations (`Accept: text/html`) for exactly `/` and
 * `/admin…`, so the API routes under the same prefixes (`/admin/users`, …) are never shadowed; the app uses a hash
 * router, so no other fallback is needed.
 */
/**
 * The backend's own default CSP is `default-src 'none'` (it serves JSON); the client needs scripts, styles and Monaco's
 * blob workers from its own origin. Same shape as the production nginx policy (`docker/client-nginx/entrypoint.sh`),
 * everything same-origin.
 */
export const CLIENT_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

export const createClientMiddleware = (clientDir: string): express.RequestHandler[] => {
  const root = path.resolve(clientDir);
  const pages = (req: Request, res: Response, next: NextFunction): void => {
    const readable = req.method === 'GET' || req.method === 'HEAD';
    const wantsHtml = (req.headers.accept ?? '').includes('text/html');
    const isPage = wantsHtml && (req.path === '/' || ADMIN_ROUTE_PATTERN.test(req.path));
    const isAsset = /\.(js|css|png|svg|woff2?|ico|map)$/.test(req.path);
    if (readable && (isPage || isAsset)) res.setHeader('Content-Security-Policy', CLIENT_CSP);
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!(req.headers.accept ?? '').includes('text/html')) return next();
    if (req.path === '/') return res.sendFile(path.join(root, 'index.html'));
    if (ADMIN_ROUTE_PATTERN.test(req.path)) return res.sendFile(path.join(root, 'admin.html'));
    return next();
  };
  return [pages, express.static(root, { index: false, fallthrough: true })];
};

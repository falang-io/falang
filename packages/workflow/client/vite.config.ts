import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Matches `/admin`, `/admin/`, `/admin/anything` (including nested segments) but not a path with a
// file extension (e.g. `/admin.html` itself, or a real asset under `/admin/...`) — see
// ADR 0030 (private), "Admin sub-application".
const ADMIN_ROUTE_PATTERN = /^\/admin(\/[^.]*)?$/;

/**
 * Rewrites any admin-app route to `/admin.html` so Vite's dev server (and — via
 * `build.rollupOptions.input` below — a future production build) serves the second Vite entry
 * point for the whole `/admin` sub-app, not just the bare `/admin` path. Vite's own multi-entry
 * convention only maps `/admin` → `admin.html`; it has no notion of `/admin/<anything>` at all.
 */
const adminHtmlFallback = (): Plugin => ({
  name: 'admin-html-fallback',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (!req.url) return next();
      const [pathname, query] = req.url.split('?');
      if (pathname && ADMIN_ROUTE_PATTERN.test(pathname)) {
        req.url = query ? `/admin.html?${query}` : '/admin.html';
      }
      next();
    });
  },
});

export default defineConfig({
  plugins: [react(), adminHtmlFallback()],
  server: {
    // This dev server is never exposed beyond a trusted local/docker-internal network (see
    // docker-compose.workflow.yml / docker-compose.workflow-e2e.yml) — no production build exists
    // for this MVP. Without this, Vite's Host-header check rejects requests whose Host isn't
    // "localhost" (e.g. `packages/workflow/e2e-tests`' Playwright browser, which reaches this
    // server via the docker-internal hostname `client`, not `localhost`).
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      // Two Vite entry points sharing one container/deployment — see ADR 0030 (private)'s "Admin
      // sub-application" decision. No production build is actually used yet (see the `server`
      // comment above), but this keeps `npm run build -w @falang/workflow-client` working.
      input: {
        main: 'index.html',
        admin: 'admin.html',
      },
    },
  },
});

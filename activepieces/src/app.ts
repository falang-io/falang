import express from 'express';
import type { Express } from 'express';
import { requireServiceSecret } from './auth-middleware.js';
import { piecesRouter } from './routes/pieces.js';
import { runRouter } from './routes/run.js';
import { pollRouter } from './routes/poll.js';
import { optionsRouter } from './routes/options.js';
import { mockRouter } from './routes/mock.js';
import { mockOAuth2Router } from './routes/mock-oauth2.js';

/** Split out from `main.ts` so unit tests can exercise the routes (via `supertest`) without binding
 * a real port — `main.ts` is the only thing that calls `app.listen()`. */
export const createApp = (): Express => {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Mounted BEFORE the `requireServiceSecret`-gated block below: `requireServiceSecret` is plain
  // Express middleware bound to `/` with no path scoping of its own — registering it earlier in the
  // stack would make it run (and reject) for *every* request that reaches this app, including ones
  // meant for a router registered later, not just `piecesRouter`/etc. Mounting `mockOAuth2Router`
  // first means Express's router only intercepts its own exact paths and calls `next()` for
  // everything else, letting unrelated requests still reach the guarded routers below unaffected.
  if (process.env.NODE_ENV === 'test') {
    // NOT behind `requireServiceSecret`: simulates a real OAuth2 vendor's own unauthenticated
    // authorize/token endpoints — see `mock-oauth2.ts` and ADR 0015 (private).
    app.use(mockOAuth2Router);
  }

  app.use(requireServiceSecret, piecesRouter, runRouter, pollRouter, optionsRouter);
  // Test-only fixture endpoints — see `mock-piece.ts` and ADR 0013 (private).
  if (process.env.NODE_ENV === 'test') {
    app.use(requireServiceSecret, mockRouter);
  }

  return app;
};

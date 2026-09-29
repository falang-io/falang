import { createHash, randomUUID } from 'node:crypto';
import express, { Router } from 'express';

interface IIssuedCode {
  readonly redirectUri: string;
  readonly codeChallenge?: string;
  readonly expiresAt: number;
}

const CODE_TTL_MS = 120_000;
/** Deliberately tiny so an e2e test can prove `auth-resolver.ts`'s reactive refresh fires for real, no clock mocking. */
const TOKEN_EXPIRES_IN_SECONDS = 2;

const issuedCodes = new Map<string, IIssuedCode>();

/**
 * Self-built stand-in for a real OAuth2 vendor's authorization/token endpoints, mounted only when
 * `NODE_ENV=test` (see `app.ts`) — no real OAuth2-authed `@activepieces/piece-*` package exists in
 * this repo to test against, so `mock-oauth2-piece.ts` points at this instead. Deliberately mounted
 * OUTSIDE `requireServiceSecret`: it's hit directly by the end user's own browser (the authorize
 * redirect) and by `backend`'s server-side token exchange, neither of which carries our internal
 * secret — a real vendor's endpoints are unauthenticated the same way. See
 * ADR 0015 (private).
 */
export const mockOAuth2Router = Router();

mockOAuth2Router.get('/mock-oauth2/authorize', (req, res) => {
  const { redirect_uri: redirectUri, state, code_challenge: codeChallenge } = req.query as Record<string, string>;
  if (!redirectUri) {
    res.status(400).send('missing redirect_uri');
    return;
  }
  const code = randomUUID();
  issuedCodes.set(code, { redirectUri, codeChallenge, expiresAt: Date.now() + CODE_TTL_MS });
  const redirect = new URL(redirectUri);
  redirect.searchParams.set('code', code);
  if (state) redirect.searchParams.set('state', state);
  // Auto-approves — this is a deterministic fixture, not a real consent screen to click through.
  res.redirect(redirect.toString());
});

mockOAuth2Router.post('/mock-oauth2/token', express.urlencoded({ extended: false }), (req, res) => {
  const { grant_type: grantType, code, code_verifier: codeVerifier } = req.body as Record<string, string | undefined>;
  if (grantType === 'authorization_code') {
    const issued = code ? issuedCodes.get(code) : undefined;
    if (!code || !issued || issued.expiresAt < Date.now()) {
      res.status(400).json({ error: 'invalid_grant' });
      return;
    }
    issuedCodes.delete(code);
    if (issued.codeChallenge) {
      const computed = createHash('sha256')
        .update(codeVerifier ?? '')
        .digest('base64url');
      if (computed !== issued.codeChallenge) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
    }
  } else if (grantType !== 'refresh_token') {
    res.status(400).json({ error: 'unsupported_grant_type' });
    return;
  }
  res.json({
    access_token: `mock-access-${randomUUID()}`,
    refresh_token: `mock-refresh-${randomUUID()}`,
    expires_in: TOKEN_EXPIRES_IN_SECONDS,
    token_type: 'bearer',
  });
});

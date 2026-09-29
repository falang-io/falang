import { createAction, createPiece, PieceAuth, Property } from '@activepieces/pieces-framework';
import { createMockItem } from './mock-piece.js';

const MOCK_OAUTH_BASE_URL = process.env.MOCK_OAUTH_BASE_URL ?? 'http://localhost:4100/mock-oauth2';

/**
 * Third test-only fixture piece, registered only when `NODE_ENV=test` (see `registry.ts`) — exercises
 * OAuth2 end-to-end against `routes/mock-oauth2.ts`'s self-built authorization/token server, since no
 * real OAuth2-authed `@activepieces/piece-*` package is installed anywhere in this repo. See
 * ADR 0015 (private).
 *
 * `pkce: true` deliberately — the hardest path, costs nothing since we own the mock authorization
 * server, and is the one thing genuinely worth proving works given there's no real piece to test
 * against. `expires_in: 2` (seconds) on the mock token server's issued tokens is deliberately tiny
 * so an e2e test can prove `auth-resolver.ts`'s reactive refresh fires for real, no clock mocking.
 */
const auth = PieceAuth.OAuth2({
  displayName: 'Mock OAuth2 account',
  required: true,
  authUrl: `${MOCK_OAUTH_BASE_URL}/authorize`,
  tokenUrl: `${MOCK_OAUTH_BASE_URL}/token`,
  scope: ['profile'],
  pkce: true,
  pkceMethod: 'S256',
});

const whoAmIAction = createAction({
  name: 'who_am_i',
  displayName: 'Who am I',
  description: 'Records the resolved OAuth2 access token into the mock store — proves the credential round trip.',
  auth,
  props: {
    title: Property.ShortText({ displayName: 'Title', required: true }),
  },
  run: async (context) => createMockItem(context.propsValue.title, context.auth.access_token),
});

export const mockOAuth2Piece = createPiece({
  displayName: 'Mock OAuth2 (test only)',
  logoUrl: '',
  authors: ['falang'],
  description: 'In-memory fixture piece exercising OAuth2 — never registered outside NODE_ENV=test.',
  auth,
  actions: [whoAmIAction],
  triggers: [],
});

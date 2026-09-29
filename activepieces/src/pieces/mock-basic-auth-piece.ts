import { createAction, createPiece, PieceAuth, Property } from '@activepieces/pieces-framework';
import { createMockItem } from './mock-piece.js';

/**
 * Second test-only fixture piece, registered only when `NODE_ENV=test` (see `registry.ts`) alongside
 * `mockPiece` — exercises `BasicAuth` (username + password) end-to-end, the one auth kind
 * `mock-piece.ts`'s `CustomAuth` doesn't cover. See ADR 0014 (private).
 *
 * Reuses `mock-piece.ts`'s shared item store (`GET /mock/items`) purely as a verification channel:
 * the `activepieces-action` node kind has no result-binding of its own (see
 * `activepieces-action-nodes.ts` — no `resultVariable`), so this is the only way an e2e test can
 * observe what actually reached the action's `context.auth`, proving the credential's `username`/
 * `password` fields really made the round trip through `normalizeAuthFields`/`resolveAuthValue`.
 */
const auth = PieceAuth.BasicAuth({
  displayName: 'Basic account',
  required: true,
  username: { displayName: 'Username' },
  password: { displayName: 'Password' },
});

const whoAmIAction = createAction({
  name: 'who_am_i',
  displayName: 'Who am I',
  description: 'Records the resolved BasicAuth username into the mock store — proves the credential round trip.',
  auth,
  props: {
    title: Property.ShortText({ displayName: 'Title', required: true }),
  },
  run: async (context) => createMockItem(context.propsValue.title, context.auth.username),
});

export const mockBasicAuthPiece = createPiece({
  displayName: 'Mock BasicAuth (test only)',
  logoUrl: '',
  authors: ['falang'],
  description: 'In-memory fixture piece exercising BasicAuth — never registered outside NODE_ENV=test.',
  auth,
  actions: [whoAmIAction],
  triggers: [],
});

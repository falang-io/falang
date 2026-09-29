import type { Piece } from '@activepieces/pieces-framework';

/** One `PieceAuth.*` definition as its plain runtime object — `type`/`displayName`/`props`/… */
export type TPieceAuthProperty = Readonly<Record<string, unknown>>;

/**
 * Which auth method to expose for a piece that declares several — keyed by piece name, valued by
 * the method's own `displayName` (the only stable identifier a `PieceAuth.*` entry carries; array
 * order isn't a contract). A piece absent here gets its *first* declared method, which is also what
 * ActivePieces' own UI preselects.
 *
 * Every override below prefers a static-token method over the piece's OAuth2 one on purpose: this
 * product's audience is developers running it self-hosted (see ADR 0017 (private)'s positioning),
 * for whom "create a bot/app, paste its token" is one step, while OAuth2 additionally needs a
 * vendor-registered app with this deployment's public callback URL. Both methods drive the exact
 * same piece code (`context.auth.type` is what the piece branches on — verified against the
 * installed bundles, e.g. Slack's `getTeamId`/Notion's `getNotionToken`), so nothing is lost. Flip
 * a piece to its OAuth2 method by deleting its line here.
 */
export const PIECE_AUTH_METHODS: Readonly<Record<string, string>> = {
  slack: 'Bot Token',
  notion: 'Access Token',
  hubspot: 'Private App Access Token',
  github: 'Personal Access Token',
  intercom: 'Access Token',
};

const isAuthArray = (auth: unknown): auth is readonly TPieceAuthProperty[] => Array.isArray(auth);

/**
 * Newer `@activepieces/pieces-framework` releases let `createPiece({ auth })` take an *array* of
 * auth methods (e.g. Slack: OAuth2 or a bot token; Google pieces: OAuth2 or a service account) —
 * `Piece<PieceAuthProperty | PieceAuthProperty[]>`. This adapter's credential model is one fixed
 * field list per vendor (`pieceToCredentialIntegration` in `@falang/workflow-integrations-activepieces`),
 * so exactly one method is picked here, once, for both the catalog (`normalize.ts`) and runtime auth
 * resolution (`auth-resolver.ts`) — the two must agree or the saved credential fields won't match
 * what `resolveAuthValue` reads back. Throws (rather than silently falling back) when an override
 * names a method the installed piece version no longer declares, so a piece upgrade that renames
 * one is caught by `registry.test.ts`, not by a user's broken credential form.
 */
export const selectPieceAuth = (pieceName: string, piece: Piece): TPieceAuthProperty | undefined => {
  const auth = piece.auth as unknown;
  if (!auth) return undefined;
  if (!isAuthArray(auth)) return auth as TPieceAuthProperty;

  const preferred = PIECE_AUTH_METHODS[pieceName];
  if (preferred === undefined) return auth[0];
  const selected = auth.find((method) => method['displayName'] === preferred);
  if (!selected) {
    const available = auth.map((method) => `"${String(method['displayName'])}"`).join(', ');
    throw new Error(
      `Piece "${pieceName}" declares no auth method named "${preferred}" (available: ${available}) — update PIECE_AUTH_METHODS`,
    );
  }
  return selected;
};

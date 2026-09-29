import type { Piece } from '@activepieces/pieces-framework';
import { TriggerStrategy } from '@activepieces/shared';
import { selectPieceAuth } from './select-auth.js';

export interface INormalizedProperty {
  readonly name: string;
  readonly type: string;
  readonly displayName: string;
  readonly description?: string;
  readonly required: boolean;
  /** Only present for STATIC_DROPDOWN/STATIC_MULTI_SELECT_DROPDOWN — DROPDOWN's `options()` is a
   * function and can't be serialized here; resolving it live is a follow-up (see ADR 0010). */
  readonly options?: readonly { label: string; value: unknown }[];
  /** Only present for DROPDOWN/MULTI_SELECT_DROPDOWN — names of this action/trigger's other props
   * this one's dynamic `options()` depends on (re-fetch when any of them changes). Resolving the
   * options themselves is `GET .../fields/:fieldName/options` (`routes/options.ts`); no client wires
   * that route yet, so this is metadata only for now — see ADR 0014's "What this doesn't cover". */
  readonly refreshers?: readonly string[];
}

export interface INormalizedAction {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly props: readonly INormalizedProperty[];
}

/** Only `POLLING`-strategy triggers are ever normalized — see ADR 0011's scope (webhook/manual triggers excluded). */
export interface INormalizedTrigger {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly props: readonly INormalizedProperty[];
}

/** One credential field a piece's auth needs — see `normalizeAuth` for the per-auth-type mapping. */
export interface INormalizedAuthField {
  readonly name: string;
  readonly kind: 'text' | 'secret';
  readonly displayName: string;
  /** OAUTH2 only — the token/expiry fields the callback writes, never rendered as a user input. */
  readonly hidden?: boolean;
  /** OAUTH2 only — lets `prod` fall back to `dev` (one OAuth app/connection per credential instance). */
  readonly secretProdOptional?: boolean;
}

/** OAuth2 authorization-code-flow config, present only when `INormalizedAuth.type === 'OAUTH2'` — see
 * ADR 0015 (private). */
export interface INormalizedOAuth2Config {
  readonly authUrl: string;
  readonly tokenUrl: string;
  readonly scope: readonly string[];
  readonly pkce?: boolean;
  readonly pkceMethod?: 'plain' | 'S256';
  readonly authorizationMethod?: 'HEADER' | 'BODY';
  readonly prompt?: 'none' | 'consent' | 'login' | 'omit';
  /** Extra authorize-URL query params — see `ACTIVEPIECES_OAUTH2_DEFAULT_EXTRA`. An empty-string value means "suppress this param". */
  readonly extra: Readonly<Record<string, string>>;
}

export interface INormalizedAuth {
  readonly type: string;
  readonly displayName: string;
  readonly required: boolean;
  /** SECRET_TEXT -> one `secret_text` field; BASIC_AUTH -> `username`+`password`; CUSTOM_AUTH -> one
   * field per sub-prop (SecretText sub-props map to `kind: 'secret'`, everything else to `'text'`);
   * OAUTH2 -> `client_id`/`client_secret` + any config-side `props` + hidden token fields, see
   * `normalizeAuthFields`'s OAUTH2 branch and ADR 0015 (private). */
  readonly fields: readonly INormalizedAuthField[];
  /** Only present when `type === 'OAUTH2'`. */
  readonly oauth2?: INormalizedOAuth2Config;
}

export interface INormalizedPiece {
  readonly pieceName: string;
  readonly displayName: string;
  readonly auth: INormalizedAuth | undefined;
  readonly actions: readonly INormalizedAction[];
  readonly triggers: readonly INormalizedTrigger[];
}

const normalizeAuthFields = (auth: Record<string, unknown>): readonly INormalizedAuthField[] => {
  const type = String(auth['type']);
  if (type === 'SECRET_TEXT') {
    return [{ name: 'secret_text', kind: 'secret', displayName: String(auth['displayName']) }];
  }
  if (type === 'BASIC_AUTH') {
    const username = auth['username'] as Record<string, unknown> | undefined;
    const password = auth['password'] as Record<string, unknown> | undefined;
    return [
      { name: 'username', kind: 'text', displayName: String(username?.['displayName'] ?? 'Username') },
      { name: 'password', kind: 'secret', displayName: String(password?.['displayName'] ?? 'Password') },
    ];
  }
  if (type === 'CUSTOM_AUTH') {
    const props = auth['props'] as Record<string, Record<string, unknown>> | undefined;
    return Object.entries(props ?? {}).map(([name, prop]) => ({
      name,
      kind: prop['type'] === 'SECRET_TEXT' ? 'secret' : 'text',
      displayName: String(prop['displayName']),
    }));
  }
  if (type === 'OAUTH2') {
    const props = auth['props'] as Record<string, Record<string, unknown>> | undefined;
    const propFields: INormalizedAuthField[] = Object.entries(props ?? {}).map(([name, prop]) => ({
      name,
      kind: prop['type'] === 'SECRET_TEXT' ? 'secret' : 'text',
      displayName: String(prop['displayName']),
      ...(prop['type'] === 'SECRET_TEXT' ? { secretProdOptional: true } : {}),
    }));
    return [
      { name: 'client_id', kind: 'text', displayName: 'Client ID' },
      { name: 'client_secret', kind: 'secret', displayName: 'Client secret', secretProdOptional: true },
      ...propFields,
      { name: 'access_token', kind: 'secret', displayName: 'Access token', hidden: true, secretProdOptional: true },
      { name: 'refresh_token', kind: 'secret', displayName: 'Refresh token', hidden: true, secretProdOptional: true },
      { name: 'expires_at', kind: 'text', displayName: 'Expires at', hidden: true },
      { name: 'oauth_data', kind: 'text', displayName: 'OAuth data', hidden: true },
    ];
  }
  // OIDC/etc. — not supported by this adapter yet, see ADR 0010's scope.
  return [];
};

/**
 * ActivePieces' own server (`oauth2-util.ts`'s `buildAuthorizationUrl`) puts `access_type=offline`
 * and `prompt=consent` on *every* piece's authorize URL, then spreads the piece's `extra` over them
 * (a piece opts out by setting a param to `''`). Pieces are written against that: the Google ones
 * declare no `extra` at all and still rely on `access_type=offline` — without it Google issues no
 * `refresh_token`, so the connection would silently die after the first access token's hour.
 * Reproduced here, at the adapter boundary, rather than in `backend`'s generic OAuth2 controller,
 * so native (non-ActivePieces) vendors' authorize URLs stay exactly as they were.
 */
const ACTIVEPIECES_OAUTH2_DEFAULT_EXTRA: Readonly<Record<string, string>> = {
  access_type: 'offline',
  prompt: 'consent',
};

const normalizeOAuth2Extra = (extra: unknown): Readonly<Record<string, string>> => {
  const pieceExtra: Record<string, string> = {};
  if (extra && typeof extra === 'object') {
    for (const [key, value] of Object.entries(extra as Record<string, unknown>)) {
      if (typeof value === 'string') pieceExtra[key] = value;
    }
  }
  return { ...ACTIVEPIECES_OAUTH2_DEFAULT_EXTRA, ...pieceExtra };
};

const normalizeOAuth2Config = (auth: Record<string, unknown>): INormalizedOAuth2Config => ({
  authUrl: String(auth['authUrl']),
  tokenUrl: String(auth['tokenUrl']),
  scope: Array.isArray(auth['scope']) ? (auth['scope'] as string[]) : [],
  extra: normalizeOAuth2Extra(auth['extra']),
  ...(typeof auth['pkce'] === 'boolean' ? { pkce: auth['pkce'] } : {}),
  ...(typeof auth['pkceMethod'] === 'string' ? { pkceMethod: auth['pkceMethod'] as 'plain' | 'S256' } : {}),
  ...(typeof auth['authorizationMethod'] === 'string'
    ? { authorizationMethod: auth['authorizationMethod'] as 'HEADER' | 'BODY' }
    : {}),
  ...(typeof auth['prompt'] === 'string' ? { prompt: auth['prompt'] as 'none' | 'consent' | 'login' | 'omit' } : {}),
});

const normalizeProperty = (name: string, property: Record<string, unknown>): INormalizedProperty => {
  const type = String(property['type']);
  const staticOptions = property['options'] as { options?: { label: string; value: unknown }[] } | undefined;
  const isDynamicDropdown = type === 'DROPDOWN' || type === 'MULTI_SELECT_DROPDOWN';
  return {
    name,
    type,
    displayName: String(property['displayName']),
    description: typeof property['description'] === 'string' ? property['description'] : undefined,
    required: Boolean(property['required']),
    options: Array.isArray(staticOptions?.options) ? staticOptions.options : undefined,
    refreshers: isDynamicDropdown && Array.isArray(property['refreshers']) ? property['refreshers'] : undefined,
  };
};

/** Plain-JSON projection of a `Piece` — see `GET /pieces` and ADR 0010's service contract. A
 * multi-auth piece is projected through the one method `selectPieceAuth` picks for it. */
export const normalizePiece = (pieceName: string, piece: Piece): INormalizedPiece => {
  const auth = selectPieceAuth(pieceName, piece);
  return {
    pieceName,
    displayName: piece.displayName,
    auth: auth
      ? {
          type: String(auth['type']),
          displayName: String(auth['displayName']),
          required: Boolean(auth['required']),
          fields: normalizeAuthFields(auth),
          ...(String(auth['type']) === 'OAUTH2' ? { oauth2: normalizeOAuth2Config(auth) } : {}),
        }
      : undefined,
    actions: Object.values(piece.actions()).map((action) => ({
      name: action.name,
      displayName: action.displayName,
      description: action.description,
      props: Object.entries(action.props as Record<string, Record<string, unknown>>).map(([name, property]) =>
        normalizeProperty(name, property),
      ),
    })),
    triggers: Object.values(piece.triggers())
      .filter((trigger) => trigger.type === TriggerStrategy.POLLING)
      .map((trigger) => ({
        name: trigger.name,
        displayName: trigger.displayName,
        description: trigger.description,
        props: Object.entries(trigger.props as Record<string, Record<string, unknown>>).map(([name, property]) =>
          normalizeProperty(name, property),
        ),
      })),
  };
};

/**
 * Plain-JSON contract for the standalone `falang-workflow-activepieces` service's `GET /pieces` —
 * hand-duplicated from `activepieces/src/pieces/normalize.ts`'s output rather than shared as a
 * workspace package, since that service is deliberately outside the npm workspace (see
 * ADR 0010 (private)). Keep these two in sync by hand when the
 * service's normalization shape changes.
 */

export interface IActivepiecesPropertyCatalogEntry {
  readonly name: string;
  readonly type: string;
  readonly displayName: string;
  readonly description?: string;
  readonly required: boolean;
  readonly options?: readonly { readonly label: string; readonly value: unknown }[];
  /** DROPDOWN/MULTI_SELECT_DROPDOWN only — sibling prop names whose value changes should re-fetch options. */
  readonly refreshers?: readonly string[];
}

export interface IActivepiecesActionCatalogEntry {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly props: readonly IActivepiecesPropertyCatalogEntry[];
}

/** Only `POLLING`-strategy triggers ever appear here — see ADR 0011 (private)'s scope. */
export interface IActivepiecesTriggerCatalogEntry {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly props: readonly IActivepiecesPropertyCatalogEntry[];
}

export interface IActivepiecesAuthFieldCatalogEntry {
  readonly name: string;
  readonly kind: 'text' | 'secret';
  readonly displayName: string;
  /** OAUTH2 only — the token/expiry fields the callback writes, never rendered as a user input. */
  readonly hidden?: boolean;
  /** OAUTH2 only — lets `prod` fall back to `dev` (one OAuth app/connection per credential instance). */
  readonly secretProdOptional?: boolean;
}

/** OAuth2 authorization-code-flow config, present only when the auth's `type === 'OAUTH2'`. */
export interface IActivepiecesOAuth2CatalogEntry {
  readonly authUrl: string;
  readonly tokenUrl: string;
  readonly scope: readonly string[];
  readonly pkce?: boolean;
  readonly pkceMethod?: 'plain' | 'S256';
  readonly authorizationMethod?: 'HEADER' | 'BODY';
  readonly prompt?: 'none' | 'consent' | 'login' | 'omit';
  /** Extra authorize-URL params (ActivePieces' `access_type=offline`/`prompt=consent` defaults merged with the piece's own `extra`; `''` = suppress) — see `IOAuth2Config.extra`. */
  readonly extra?: Readonly<Record<string, string>>;
}

export interface IActivepiecesAuthCatalogEntry {
  readonly type: string;
  readonly displayName: string;
  readonly required: boolean;
  readonly fields: readonly IActivepiecesAuthFieldCatalogEntry[];
  readonly oauth2?: IActivepiecesOAuth2CatalogEntry;
}

export interface IActivepiecesPieceCatalogEntry {
  readonly pieceName: string;
  readonly displayName: string;
  readonly auth: IActivepiecesAuthCatalogEntry | undefined;
  readonly actions: readonly IActivepiecesActionCatalogEntry[];
  readonly triggers: readonly IActivepiecesTriggerCatalogEntry[];
}

/**
 * OAuth2 authorization-code-flow config for a vendor whose `credentialFields` include OAuth2 tokens
 * — drives the backend's `/oauth2/start` redirect and the ActivePieces adapter's refresh call. Absent
 * for every vendor authenticated some other way. See ADR 0015 (private).
 *
 * The three optional fields below exist for vendors that deviate from the plain RFC 6749 shape every
 * other vendor in this repo follows — added for amoCRM (see
 * ADR 0017 (private)'s "OAuth2 credential-kind gap"), whose
 * token endpoint (a) lives at the connecting account's own subdomain rather than a fixed vendor-wide
 * URL, (b) wants its token request body as JSON, and (c) requires `redirect_uri` on the refresh grant
 * too, not just the authorization-code one. Every default matches today's (pre-amoCRM) behavior, so
 * no existing vendor is affected.
 */
export interface IOAuth2Config {
  readonly authUrl: string;
  /**
   * Fixed for most vendors. May instead contain the literal placeholder `{accountDomain}` when
   * `accountDomainCallbackParam` is set — see that field's doc comment and
   * `resolveOAuth2TokenUrl`/`buildOAuth2TokenRequest` in `oauth2-token-request.ts`.
   */
  readonly tokenUrl: string;
  readonly scope: readonly string[];
  readonly pkce?: boolean;
  readonly pkceMethod?: 'plain' | 'S256';
  readonly authorizationMethod?: 'HEADER' | 'BODY';
  readonly prompt?: 'none' | 'consent' | 'login' | 'omit';
  /** Token request body encoding — `'form'` (RFC 6749's `application/x-www-form-urlencoded`, every vendor's default) or `'json'` (e.g. amoCRM). Defaults to `'form'` when unset. */
  readonly tokenRequestFormat?: 'form' | 'json';
  /**
   * Set when `tokenUrl` is templated per connecting account rather than fixed for the whole vendor
   * (e.g. amoCRM's token endpoint lives at `https://{subdomain}.amocrm.ru/oauth2/access_token`, not a
   * vendor-wide URL). Names the OAuth2-callback query param the vendor echoes the account's domain
   * back on (e.g. amoCRM's `referer`) — `oauth2.controller.ts`'s callback captures it, normalizes it
   * to a bare host, and persists it into the credential's hidden `account_domain` field, from which
   * `resolveOAuth2TokenUrl` substitutes it into `tokenUrl`'s `{accountDomain}` placeholder on every
   * later exchange/refresh. A vendor declaring this must also declare an `account_domain` field
   * (`kind: 'text', hidden: true`) in `credentialFields`.
   */
  readonly accountDomainCallbackParam?: string;
  /**
   * Required whenever `accountDomainCallbackParam` is set (fail-closed — a vendor with the param but no
   * allowlist rejects every callback): the account host captured off the callback is attacker-influenced
   * and the backend then sends the token request to it (SSRF), so it must be a subdomain of one of
   * these suffixes (e.g. `['.amocrm.ru', '.amocrm.com', '.kommo.com']`; matched on whole labels,
   * https only, no port/userinfo/IP). See ADR 0016 (private) security audit P0-11.
   */
  readonly accountDomainSuffixes?: readonly string[];
  /** Vendor's refresh grant also validates `redirect_uri` against the original connect (e.g. amoCRM) — unlike bare RFC 6749 refresh, which doesn't need it. Requires `BACKEND_PUBLIC_URL` to be available wherever the refresh call is made from (both `backend` and, via `RunnerProcessManager`, `runner` pods). */
  readonly includeRedirectUriOnRefresh?: boolean;
  /**
   * Extra query params appended to the authorize URL after the standard ones (e.g. Google's
   * `access_type=offline`, Dropbox's `token_access_type=offline`, Notion's `owner=user`). An
   * empty-string value *removes* that param instead (ActivePieces' own opt-out idiom, e.g. a vendor
   * that rejects `access_type`). Applied by `oauth2.controller.ts`'s `/oauth2/start`; the ActivePieces
   * adapter fills this for every piece (see `activepieces/src/pieces/normalize.ts`), native vendors
   * leave it unset unless they need one of these.
   */
  readonly extra?: Readonly<Record<string, string>>;
}

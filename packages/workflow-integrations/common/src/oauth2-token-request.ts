import type { IOAuth2Config } from './oauth2-config.js';

type TTokenUrlConfig = Pick<IOAuth2Config, 'tokenUrl' | 'accountDomainCallbackParam'>;

/**
 * Substitutes `tokenUrl`'s `{accountDomain}` placeholder with `accountDomain` — a no-op returning
 * `tokenUrl` verbatim when the vendor's config has no `accountDomainCallbackParam` (i.e. `tokenUrl` is
 * already a fixed, vendor-wide URL). See `IOAuth2Config.accountDomainCallbackParam`'s doc comment.
 */
export const resolveOAuth2TokenUrl = (oauth2: TTokenUrlConfig, accountDomain: string | null): string => {
  if (!oauth2.accountDomainCallbackParam) return oauth2.tokenUrl;
  if (!accountDomain) {
    throw new Error('OAuth2 account domain is required for this vendor but was not captured for this credential');
  }
  return oauth2.tokenUrl.replace('{accountDomain}', accountDomain);
};

/**
 * Builds a POST request to a vendor's OAuth2 token endpoint per `oauth2`'s config — shared by the
 * backend's `/oauth2/callback` authorization-code exchange and `oauth2-runtime.ts`'s native-path
 * refresh, since both need the same vendor-variance handling (form vs. JSON body, header vs. body
 * client auth, fixed vs. per-account `tokenUrl`). The ActivePieces adapter (`activepieces/`, outside
 * the npm workspace) hand-duplicates the plain RFC 6749 subset of this for its own refresh call — see
 * ADR 0015 (private).
 */
export const buildOAuth2TokenRequest = (
  oauth2: Pick<IOAuth2Config, 'tokenUrl' | 'authorizationMethod' | 'tokenRequestFormat' | 'accountDomainCallbackParam'>,
  clientId: string,
  clientSecret: string,
  params: Readonly<Record<string, string>>,
  accountDomain: string | null = null,
): { readonly url: string; readonly init: RequestInit } => {
  const url = resolveOAuth2TokenUrl(oauth2, accountDomain);
  const allParams: Record<string, string> = { ...params };
  const headers: Record<string, string> = {};
  if (oauth2.authorizationMethod === 'HEADER') {
    headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    allParams.client_id = clientId;
    allParams.client_secret = clientSecret;
  }
  if (oauth2.tokenRequestFormat === 'json') {
    headers['content-type'] = 'application/json';
    return { url, init: { method: 'POST', headers, body: JSON.stringify(allParams) } };
  }
  headers['content-type'] = 'application/x-www-form-urlencoded';
  return { url, init: { method: 'POST', headers, body: new URLSearchParams(allParams) } };
};

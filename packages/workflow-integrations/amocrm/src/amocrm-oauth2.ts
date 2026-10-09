import type { IOAuth2Config } from '@falang/workflow-integrations-common';

/**
 * amoCRM's OAuth2 flow deviates from the plain RFC 6749 shape every other vendor in this repo
 * follows in three ways — see `IOAuth2Config`'s doc comment and
 * ADR 0017 (private)'s "OAuth2 credential-kind gap":
 * (1) the token endpoint lives at the connecting account's own subdomain, echoed back on the OAuth2
 * callback's `referer` query param; (2) the token request body is JSON, not form-urlencoded;
 * (3) the refresh grant also validates `redirect_uri`. Verified against amoCRM's own developer docs
 * and the `amocrm/amocrm-oauth-client` reference client (2026-09-16) — amoCRM does not use a `scope`
 * parameter, hence the empty array.
 */
export const amocrmOAuth2Config: IOAuth2Config = {
  authUrl: 'https://www.amocrm.ru/oauth',
  tokenUrl: 'https://{accountDomain}/oauth2/access_token',
  scope: [],
  tokenRequestFormat: 'json',
  accountDomainCallbackParam: 'referer',
  // amoCRM account hosts: `<sub>.amocrm.ru` / `<sub>.amocrm.com` (+ Kommo, the international rebrand, `<sub>.kommo.com`).
  accountDomainSuffixes: ['.amocrm.ru', '.amocrm.com', '.kommo.com'],
  includeRedirectUriOnRefresh: true,
  // One public amoCRM integration for the whole platform: its id/secret are set on the admin app's
  // "OAuth credentials" page, users only click "Connect" (ADR 0030 (private)'s model for ActivePieces).
  platformClient: true,
};

/** The subset of `amocrmOAuth2Config` the runner-side activity code passes along — serialized via `JSON.stringify` so the emitted literal can never drift from the descriptor above. */
export const amocrmOAuth2RuntimeConfig = {
  tokenUrl: amocrmOAuth2Config.tokenUrl,
  tokenRequestFormat: amocrmOAuth2Config.tokenRequestFormat,
  accountDomainCallbackParam: amocrmOAuth2Config.accountDomainCallbackParam,
  includeRedirectUriOnRefresh: amocrmOAuth2Config.includeRedirectUriOnRefresh,
};

/**
 * Normalizes the raw value captured off a vendor's OAuth2-callback account-domain query param (see
 * `IOAuth2Config.accountDomainCallbackParam`, e.g. amoCRM's `referer`) down to a bare host —
 * `resolveOAuth2TokenUrl`'s `{accountDomain}` placeholder is substituted with exactly this stored
 * value, so it must always be a bare host, never a full URL with a scheme. The raw value's exact
 * shape (with or without a `https://` prefix) isn't documented by amoCRM, so this accepts either.
 */
export const normalizeOAuth2AccountDomain = (raw: string): string => {
  try {
    return new URL(raw).host;
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
};

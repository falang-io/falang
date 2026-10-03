const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const reject = (): never => {
  throw new Error('Invalid account domain in OAuth2 callback');
};

const extractHost = (value: string): string => {
  if (!value.includes('://')) return value.replace(/\/$/, '');
  const url = ((): URL => {
    try {
      return new URL(value);
    } catch {
      return reject();
    }
  })();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return reject();
  if (url.pathname !== '/' && url.pathname !== '') return reject();
  return url.hostname;
};

/**
 * Validates the raw value captured off a vendor's OAuth2-callback account-domain query param (see
 * `IOAuth2Config.accountDomainCallbackParam`, e.g. amoCRM's `referer`) and normalizes it to a bare
 * host — `resolveOAuth2TokenUrl`'s `{accountDomain}` placeholder is substituted with exactly this
 * stored value, and the backend then POSTs the token request to it, so it is an SSRF vector unless it
 * is pinned to the vendor's own domains. Accepts `host` or `https://host[/]`; rejects other schemes,
 * userinfo, ports, query/fragment, IPs and anything whose host is not a strict subdomain (whole-label
 * match) of one of `allowedSuffixes`. Throws on rejection. See ADR 0016 (private) security audit P0-11.
 */
export const normalizeOAuth2AccountDomain = (raw: string, allowedSuffixes: readonly string[] | undefined): string => {
  if (!allowedSuffixes || allowedSuffixes.length === 0) return reject();
  const host = extractHost(raw.trim()).toLowerCase();
  if (!HOST_PATTERN.test(host) || /^[0-9.]+$/.test(host)) return reject();
  const allowed = allowedSuffixes.some((suffix) => {
    const normalized = suffix.toLowerCase().startsWith('.') ? suffix.toLowerCase() : `.${suffix.toLowerCase()}`;
    return host.endsWith(normalized) && host.length > normalized.length;
  });
  return allowed ? host : reject();
};

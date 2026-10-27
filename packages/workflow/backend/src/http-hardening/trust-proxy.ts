/** Value accepted by Express's `app.set('trust proxy', …)`. */
export type TTrustProxySetting = boolean | number | string[];

/**
 * Parses the `TRUST_PROXY` env var: unset/empty/`false` → `false` (the client address is the socket peer),
 * `true` → trust every hop, a number → that many hops from the server, otherwise a comma-separated list of
 * IPs/CIDRs/Express keywords (`loopback`, `linklocal`, `uniquelocal`).
 */
export const parseTrustProxy = (raw: string | undefined): TTrustProxySetting => {
  const value = (raw ?? '').trim();
  if (value === '' || value.toLowerCase() === 'false') return false;
  if (value.toLowerCase() === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries.length > 0 ? entries : false;
};

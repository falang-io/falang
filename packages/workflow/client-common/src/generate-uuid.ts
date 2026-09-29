/**
 * `crypto.randomUUID()` only works in a browser "secure context" (HTTPS or the `localhost`
 * origin) — it throws in plain HTTP on any other hostname, e.g. a docker-internal service name
 * like `http://client:5175`. `crypto.getRandomValues` has no such restriction, so fall back to
 * building a v4 UUID from it by hand when `randomUUID` isn't available.
 */
export const generateUuid = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // RFC 4122 version 4: fix the upper nibble of byte 6 to 4, keep the lower nibble random.
  bytes[6] = (bytes[6] % 16) + 64;
  // RFC 4122 variant: fix the top two bits of byte 8 to `10`, keep the rest random.
  bytes[8] = (bytes[8] % 64) + 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

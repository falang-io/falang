import tls from 'node:tls';
import {
  RUSSIAN_TRUSTED_ROOT_CA_PEM,
  RUSSIAN_TRUSTED_SUB_CA_2024_PEM,
  RUSSIAN_TRUSTED_SUB_CA_PEM,
} from './certs/russian-trusted-ca.js';

/**
 * Vendors whose API hosts are signed by a CA missing from Node's bundled roots. Only requests made inside
 * `runWithEgressVendor(<vendor>, ...)` trust the extra certificates - never the whole process (no `NODE_EXTRA_CA_CERTS`).
 * MAX (`platform-api2.max.ru`) is issued by the Russian Trusted Sub CA of Минцифры and requires its root to be trusted.
 * Not applied when egress routing is not installed (`EGRESS_ROUTING=off`, plain test harnesses): then such requests fail
 * with a TLS error - set `MAX_API_BASE_URL=https://platform-api.max.ru` while MAX still serves the old host.
 */
export const VENDOR_EXTRA_CA: Readonly<Record<string, readonly string[]>> = {
  max: [RUSSIAN_TRUSTED_ROOT_CA_PEM, RUSSIAN_TRUSTED_SUB_CA_PEM, RUSSIAN_TRUSTED_SUB_CA_2024_PEM],
};

/** `ca` replaces the default roots in Node, so the bundled ones are added back. */
export const buildVendorCa = (vendor: string | null): string[] | null => {
  const extra = vendor ? VENDOR_EXTRA_CA[vendor] : null;
  return extra ? [...tls.rootCertificates, ...extra] : null;
};

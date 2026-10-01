// oxlint-disable no-undefined -- optional env-derived settings are `undefined` when unset, matching the `?:` fields they fill.
/**
 * Temporal connection / tenancy settings, resolved once from env — see ADR 0050 (private).
 * `shared` (default) is the pre-isolation behaviour: one namespace (`TEMPORAL_NAMESPACE`, else
 * `default`), no tokens. `per-project` gives every project its own `falang-<projectId>` namespace and
 * requires a JWT signing key.
 */
export type TTemporalTenantIsolation = 'shared' | 'per-project';

export const TEMPORAL_CONFIG = Symbol('TEMPORAL_CONFIG');

export const TEMPORAL_NAMESPACE_PREFIX = 'falang-';
export const DEFAULT_JWT_AUDIENCE = 'falang-temporal';
export const JWT_ISSUER = 'falang-backend';
export const DEFAULT_TOKEN_TTL_SECONDS = 3600;
export const DEFAULT_RETENTION_DAYS = 7;
/** How long `ensureNamespace` keeps retrying a refused/unreachable Temporal (JWKS not loaded yet, server still starting) before giving up. */
export const DEFAULT_ENSURE_TIMEOUT_MS = 90_000;

export interface ITemporalJwtConfig {
  /** PKCS#8 PEM, RS256. */
  readonly privateKeyPem: string;
  /** Defaults to the RFC 7638 thumbprint of the key. */
  readonly keyId?: string;
  /** Public PEM of the key being rotated out — published in the JWKS next to the current one. */
  readonly previousPublicKeyPem?: string;
  readonly ttlSeconds: number;
  readonly audience: string;
}

export interface ITemporalConfig {
  readonly mode: TTemporalTenantIsolation;
  /** Backend's own Temporal frontend address; `undefined` = SDK default. */
  readonly address?: string;
  /** The single namespace used in `shared` mode. */
  readonly sharedNamespace: string;
  /** Whether the backend's own connection uses TLS (only meaningful with a token; default `false` — plaintext frontend). */
  readonly tls: boolean;
  readonly retentionDays: number;
  readonly ensureTimeoutMs: number;
  /** Present exactly when `mode === 'per-project'`. */
  readonly jwt?: ITemporalJwtConfig;
}

type TEnv = Readonly<Record<string, string | undefined>>;

const parsePositiveInt = (name: string, value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer, got "${value}"`);
  return parsed;
};

const nonEmpty = (value: string | undefined): string | undefined => (value && value.trim() !== '' ? value : undefined);

/** Reads and validates the Temporal env. Throws — failing the boot — on `per-project` without a signing key or on an unknown mode. */
export const resolveTemporalConfig = (env: TEnv): ITemporalConfig => {
  const rawMode = nonEmpty(env.TEMPORAL_TENANT_ISOLATION) ?? 'shared';
  if (rawMode !== 'shared' && rawMode !== 'per-project') {
    throw new Error(`TEMPORAL_TENANT_ISOLATION must be "shared" or "per-project", got "${rawMode}"`);
  }
  const base = {
    address: nonEmpty(env.TEMPORAL_ADDRESS),
    sharedNamespace: nonEmpty(env.TEMPORAL_NAMESPACE) ?? 'default',
    tls: env.TEMPORAL_TLS === 'true',
    retentionDays: parsePositiveInt(
      'TEMPORAL_NAMESPACE_RETENTION_DAYS',
      env.TEMPORAL_NAMESPACE_RETENTION_DAYS,
      DEFAULT_RETENTION_DAYS,
    ),
    ensureTimeoutMs: parsePositiveInt(
      'TEMPORAL_ENSURE_TIMEOUT_MS',
      env.TEMPORAL_ENSURE_TIMEOUT_MS,
      DEFAULT_ENSURE_TIMEOUT_MS,
    ),
  };
  if (rawMode === 'shared') return { mode: 'shared', ...base };

  const privateKeyPem = nonEmpty(env.TEMPORAL_JWT_PRIVATE_KEY);
  if (!privateKeyPem) {
    throw new Error('TEMPORAL_TENANT_ISOLATION=per-project requires TEMPORAL_JWT_PRIVATE_KEY (PKCS#8 PEM, RS256)');
  }
  return {
    mode: 'per-project',
    ...base,
    jwt: {
      privateKeyPem,
      keyId: nonEmpty(env.TEMPORAL_JWT_KEY_ID),
      previousPublicKeyPem: nonEmpty(env.TEMPORAL_JWT_PREVIOUS_PUBLIC_KEY),
      ttlSeconds: parsePositiveInt('TEMPORAL_JWT_TTL_SECONDS', env.TEMPORAL_JWT_TTL_SECONDS, DEFAULT_TOKEN_TTL_SECONDS),
      audience: nonEmpty(env.TEMPORAL_JWT_AUDIENCE) ?? DEFAULT_JWT_AUDIENCE,
    },
  };
};

// oxlint-disable no-undefined -- test fixtures: explicit "no value" fixtures, fake-timer scaffolding and long per-case suites.
import { describe, expect, it } from 'vitest';
import { resolveTemporalConfig } from './temporal-config.js';

describe('resolveTemporalConfig', () => {
  it('defaults to shared mode: one namespace, no JWT, plaintext, 7 days retention', () => {
    expect(resolveTemporalConfig({})).toEqual({
      mode: 'shared',
      address: undefined,
      sharedNamespace: 'default',
      tls: false,
      retentionDays: 7,
      ensureTimeoutMs: 90_000,
    });
  });

  it('uses TEMPORAL_NAMESPACE and TEMPORAL_ADDRESS in shared mode', () => {
    const config = resolveTemporalConfig({ TEMPORAL_NAMESPACE: 'prod', TEMPORAL_ADDRESS: 'temporal:7233' });

    expect(config).toMatchObject({ mode: 'shared', sharedNamespace: 'prod', address: 'temporal:7233' });
  });

  it('refuses per-project without a signing key', () => {
    expect(() => resolveTemporalConfig({ TEMPORAL_TENANT_ISOLATION: 'per-project' })).toThrow(
      /TEMPORAL_JWT_PRIVATE_KEY/,
    );
  });

  it('refuses an unknown mode', () => {
    expect(() => resolveTemporalConfig({ TEMPORAL_TENANT_ISOLATION: 'per-user' })).toThrow(/shared.*per-project/);
  });

  it('reads the per-project JWT settings with their defaults', () => {
    const config = resolveTemporalConfig({ TEMPORAL_TENANT_ISOLATION: 'per-project', TEMPORAL_JWT_PRIVATE_KEY: 'PEM' });

    expect(config.mode).toBe('per-project');
    expect(config.jwt).toEqual({
      privateKeyPem: 'PEM',
      keyId: undefined,
      previousPublicKeyPem: undefined,
      ttlSeconds: 3600,
      audience: 'falang-temporal',
    });
  });

  it('reads the explicit overrides', () => {
    const config = resolveTemporalConfig({
      TEMPORAL_TENANT_ISOLATION: 'per-project',
      TEMPORAL_JWT_PRIVATE_KEY: 'PEM',
      TEMPORAL_JWT_KEY_ID: 'k1',
      TEMPORAL_JWT_PREVIOUS_PUBLIC_KEY: 'OLD',
      TEMPORAL_JWT_TTL_SECONDS: '20',
      TEMPORAL_JWT_AUDIENCE: 'aud',
      TEMPORAL_TLS: 'true',
      TEMPORAL_NAMESPACE_RETENTION_DAYS: '3',
    });

    expect(config).toMatchObject({ tls: true, retentionDays: 3 });
    expect(config.jwt).toMatchObject({ keyId: 'k1', previousPublicKeyPem: 'OLD', ttlSeconds: 20, audience: 'aud' });
  });

  it('rejects a non-positive or non-numeric TTL / retention', () => {
    const base = { TEMPORAL_TENANT_ISOLATION: 'per-project', TEMPORAL_JWT_PRIVATE_KEY: 'PEM' };

    expect(() => resolveTemporalConfig({ ...base, TEMPORAL_JWT_TTL_SECONDS: '0' })).toThrow(/TEMPORAL_JWT_TTL_SECONDS/);
    expect(() => resolveTemporalConfig({ ...base, TEMPORAL_NAMESPACE_RETENTION_DAYS: 'soon' })).toThrow(
      /TEMPORAL_NAMESPACE_RETENTION_DAYS/,
    );
  });
});

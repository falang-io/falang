import { describe, expect, it } from 'vitest';
import { deriveIntegrationSecret } from './derive-integration-secret.js';

const base = { key: 'k', projectId: 'p', credentialId: 'c', env: 'dev', vendor: 'webhook', label: 'l' };

describe('deriveIntegrationSecret', () => {
  it('is deterministic and depends on every input', () => {
    const secret = deriveIntegrationSecret(base);
    expect(deriveIntegrationSecret(base)).toBe(secret);
    for (const change of [
      { key: 'k2' },
      { projectId: 'p2' },
      { credentialId: 'c2' },
      { env: 'prod' },
      { vendor: 'v2' },
      { label: 'l2' },
    ]) {
      expect(deriveIntegrationSecret({ ...base, ...change })).not.toBe(secret);
    }
  });

  it('is base64url', () => {
    expect(deriveIntegrationSecret(base)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

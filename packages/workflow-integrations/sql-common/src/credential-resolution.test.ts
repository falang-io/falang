import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSqlCredentialField } from './credential-resolution.js';

describe('resolveSqlCredentialField', () => {
  beforeEach(() => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.internal');
    vi.stubEnv('INTERNAL_PROJECT_TOKEN', 'tok');
    vi.stubEnv('PROJECT_ID', 'proj-1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts to /internal/credentials/resolve with vendor/field/env and returns the resolved value', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ value: 'postgres://x' }) });
    vi.stubGlobal('fetch', fetchMock);

    const value = await resolveSqlCredentialField('cred-1', 'mysql', 'connectionString');

    expect(value).toBe('postgres://x');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend.internal/internal/credentials/resolve',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-project-token': 'tok' },
        body: JSON.stringify({
          credentialId: 'cred-1',
          vendor: 'mysql',
          field: 'connectionString',
          projectId: 'proj-1',
          env: 'dev',
        }),
      }),
    );
  });

  it('throws when required env vars are missing', async () => {
    vi.unstubAllEnvs();
    await expect(resolveSqlCredentialField('cred-1', 'mysql', 'connectionString')).rejects.toThrow(
      /not configured for this runner process/,
    );
  });

  it('throws on a failed resolve with no defaultValue given (e.g. connectionString)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('nope') }));
    await expect(resolveSqlCredentialField('cred-1', 'postgres', 'connectionString')).rejects.toThrow(
      /Failed to resolve SQL credential/,
    );
  });

  it('falls back to defaultValue on a failed resolve (e.g. an unset ssl field)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('nope') }));
    const value = await resolveSqlCredentialField('cred-1', 'postgres', 'ssl', 'prefer');
    expect(value).toBe('prefer');
  });
});

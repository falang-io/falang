import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError, resolveCredential } from './credentials.js';

describe('resolveCredential', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.internal');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts the credential coordinates with the caller token and returns the resolved value', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ value: 'sk-1' }) });
    const value = await resolveCredential('cred-1', 'activepieces-x', 'secret_text', 'p1', 'tok', 'prod');
    expect(value).toBe('sk-1');
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('http://backend.internal/internal/credentials/resolve');
    expect(init.method).toBe('POST');
    expect(init.headers['x-internal-project-token']).toBe('tok');
    expect(JSON.parse(init.body)).toEqual({
      credentialId: 'cred-1',
      vendor: 'activepieces-x',
      field: 'secret_text',
      projectId: 'p1',
      env: 'prod',
    });
  });

  it('defaults the environment to dev', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ value: 'v' }) });
    await resolveCredential('c', 'v', 'f', 'p', 'tok');
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body).env).toBe('dev');
  });

  it('throws without BACKEND_INTERNAL_URL and without a token, never calling the backend', async () => {
    await expect(resolveCredential('c', 'v', 'f', 'p', '')).rejects.toThrow(/internalProjectToken is required/);
    vi.stubEnv('BACKEND_INTERNAL_URL', '');
    await expect(resolveCredential('c', 'v', 'f', 'p', 'tok')).rejects.toThrow(/BACKEND_INTERNAL_URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a 404 to NotFoundError carrying the response text', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => 'no such credential' });
    const error = await resolveCredential('c', 'v', 'f', 'p', 'tok').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as Error).message).toBe('no such credential');
  });

  it('maps any other failure to a plain error with status and body', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    const error = await resolveCredential('c', 'v', 'f', 'p', 'tok').catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(NotFoundError);
    expect((error as Error).message).toBe('Credential resolve failed with status 500: boom');
  });
});

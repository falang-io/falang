import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveOAuth2AccessToken } from './oauth2-runtime.js';

const stubRunnerEnv = (): void => {
  vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
  vi.stubEnv('INTERNAL_PROJECT_TOKEN', 'ptok');
  vi.stubEnv('PROJECT_ID', 'project-1');
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('resolveOAuth2AccessToken', () => {
  it("asks the backend for the access token and never resolves the OAuth2 client's fields", async () => {
    stubRunnerEnv();
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => ({
      ok: true,
      json: () => Promise.resolve({ accessToken: 'tok-current', data: {} }),
      text: () => Promise.resolve(''),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await resolveOAuth2AccessToken('amocrm', 'cred-1', { tokenUrl: 'https://vendor.test/token' });

    expect(result).toBe('tok-current');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://backend.test/internal/credentials/oauth2-access-token');
    expect(init?.headers).toMatchObject({ 'x-internal-project-token': 'ptok' });
    expect(JSON.parse(init?.body as string)).toEqual({
      credentialId: 'cred-1',
      vendor: 'amocrm',
      projectId: 'project-1',
    });
  });

  it('throws with the backend status and body when the backend refuses', async () => {
    stubRunnerEnv();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => ({ ok: false, status: 502, text: () => Promise.resolve('OAuth2 refresh failed') })),
    );

    await expect(resolveOAuth2AccessToken('amocrm', 'cred-1')).rejects.toThrow(
      /Failed to resolve amocrm access token for credential cred-1: 502 OAuth2 refresh failed/,
    );
  });

  it('throws when the runner process is missing required env vars', async () => {
    await expect(resolveOAuth2AccessToken('amocrm', 'cred-1')).rejects.toThrow(
      /BACKEND_INTERNAL_URL\/INTERNAL_PROJECT_TOKEN\/PROJECT_ID/,
    );
  });
});

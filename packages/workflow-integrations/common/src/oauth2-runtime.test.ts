import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveOAuth2AccessToken } from './oauth2-runtime.js';

const config = { tokenUrl: 'https://vendor.test/token' };

const stubResolveCredentials = (values: Record<string, string>): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn((url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { field: string };
    if (!(body.field in values)) throw new Error(`no value stubbed for "${body.field}"`);
    return { ok: true, json: () => Promise.resolve({ value: values[body.field] }), text: () => Promise.resolve('') };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('resolveOAuth2AccessToken', () => {
  it('returns the current access token without refreshing when not near expiry', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    vi.stubEnv('INTERNAL_PROJECT_TOKEN', 'ptok');
    vi.stubEnv('PROJECT_ID', 'project-1');
    const fetchMock = stubResolveCredentials({
      access_token: 'tok-current',
      refresh_token: 'refresh-1',
      expires_at: String(Date.now() + 10 * 60_000),
      client_id: 'cid',
      client_secret: 'csecret',
    });

    const result = await resolveOAuth2AccessToken('amocrm', 'cred-1', config);

    expect(result).toBe('tok-current');
    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toBe('http://backend.test/internal/credentials/resolve');
    }
  });

  it('returns the current access token when there is no expiry recorded yet', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    vi.stubEnv('INTERNAL_PROJECT_TOKEN', 'ptok');
    vi.stubEnv('PROJECT_ID', 'project-1');
    stubResolveCredentials({
      access_token: 'tok-current',
      refresh_token: 'refresh-1',
      expires_at: '',
      client_id: 'cid',
      client_secret: 'csecret',
    });

    const result = await resolveOAuth2AccessToken('amocrm', 'cred-1', config);

    expect(result).toBe('tok-current');
  });

  it('returns the stale access token without throwing when expired but no refresh token is available', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    vi.stubEnv('INTERNAL_PROJECT_TOKEN', 'ptok');
    vi.stubEnv('PROJECT_ID', 'project-1');
    stubResolveCredentials({
      access_token: 'tok-stale',
      refresh_token: '',
      expires_at: String(Date.now() - 1000),
      client_id: 'cid',
      client_secret: 'csecret',
    });

    const result = await resolveOAuth2AccessToken('amocrm', 'cred-1', config);

    expect(result).toBe('tok-stale');
  });

  it('refreshes via the token endpoint (BODY auth) and best-effort persists when expired', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    vi.stubEnv('INTERNAL_PROJECT_TOKEN', 'ptok');
    vi.stubEnv('PROJECT_ID', 'project-1');
    const values: Record<string, string> = {
      access_token: 'tok-stale',
      refresh_token: 'refresh-1',
      expires_at: String(Date.now() - 1000),
      client_id: 'cid',
      client_secret: 'csecret',
    };
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      if (url === 'https://vendor.test/token') {
        return {
          ok: true,
          json: () => Promise.resolve({ access_token: 'tok-fresh', refresh_token: 'refresh-2', expires_in: 3600 }),
        };
      }
      if (url === 'http://backend.test/internal/credentials/oauth2-refresh') {
        return { ok: true, json: () => Promise.resolve({}) };
      }
      const body = JSON.parse(init.body as string) as { field: string };
      if (!(body.field in values)) throw new Error(`no value stubbed for "${body.field}"`);
      return { ok: true, json: () => Promise.resolve({ value: values[body.field] }), text: () => Promise.resolve('') };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await resolveOAuth2AccessToken('amocrm', 'cred-1', config);

    expect(result).toBe('tok-fresh');
    const refreshCall = fetchMock.mock.calls.find((call) => call[0] === 'https://vendor.test/token');
    const refreshBody = refreshCall?.[1]?.body as URLSearchParams;
    expect(refreshBody.get('grant_type')).toBe('refresh_token');
    expect(refreshBody.get('refresh_token')).toBe('refresh-1');
    expect(refreshBody.get('client_id')).toBe('cid');
    expect(refreshBody.get('client_secret')).toBe('csecret');

    const persistCall = fetchMock.mock.calls.find(
      (call) => call[0] === 'http://backend.test/internal/credentials/oauth2-refresh',
    );
    const persistBody = JSON.parse(persistCall?.[1]?.body as string) as Record<string, unknown>;
    expect(persistBody).toMatchObject({
      credentialId: 'cred-1',
      vendor: 'amocrm',
      projectId: 'project-1',
      accessToken: 'tok-fresh',
      refreshToken: 'refresh-2',
    });
  });

  it('uses HTTP Basic auth for the refresh request when authorizationMethod is HEADER', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    vi.stubEnv('INTERNAL_PROJECT_TOKEN', 'ptok');
    vi.stubEnv('PROJECT_ID', 'project-1');
    const values: Record<string, string> = {
      access_token: 'tok-stale',
      refresh_token: 'refresh-1',
      expires_at: String(Date.now() - 1000),
      client_id: 'cid',
      client_secret: 'csecret',
    };
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      if (url === 'https://vendor.test/token') {
        return { ok: true, json: () => Promise.resolve({ access_token: 'tok-fresh' }) };
      }
      if (url === 'http://backend.test/internal/credentials/oauth2-refresh') {
        return { ok: true, json: () => Promise.resolve({}) };
      }
      const body = JSON.parse(init.body as string) as { field: string };
      return { ok: true, json: () => Promise.resolve({ value: values[body.field] }), text: () => Promise.resolve('') };
    });
    vi.stubGlobal('fetch', fetchMock);

    await resolveOAuth2AccessToken('amocrm', 'cred-1', {
      tokenUrl: 'https://vendor.test/token',
      authorizationMethod: 'HEADER',
    });

    const refreshCall = fetchMock.mock.calls.find((call) => call[0] === 'https://vendor.test/token');
    const headers = refreshCall?.[1]?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Basic ${Buffer.from('cid:csecret').toString('base64')}`);
  });

  it('throws when the runner process is missing required env vars', async () => {
    await expect(resolveOAuth2AccessToken('amocrm', 'cred-1', config)).rejects.toThrow(
      /BACKEND_INTERNAL_URL\/INTERNAL_PROJECT_TOKEN\/PROJECT_ID/,
    );
  });

  it('throws when the OAuth2 refresh call itself fails', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    vi.stubEnv('INTERNAL_PROJECT_TOKEN', 'ptok');
    vi.stubEnv('PROJECT_ID', 'project-1');
    const values: Record<string, string> = {
      access_token: 'tok-stale',
      refresh_token: 'refresh-1',
      expires_at: String(Date.now() - 1000),
      client_id: 'cid',
      client_secret: 'csecret',
    };
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      if (url === 'https://vendor.test/token') return { ok: false, status: 400 };
      const body = JSON.parse(init.body as string) as { field: string };
      return { ok: true, json: () => Promise.resolve({ value: values[body.field] }), text: () => Promise.resolve('') };
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveOAuth2AccessToken('amocrm', 'cred-1', config)).rejects.toThrow(
      /OAuth2 refresh failed for "amocrm": 400/,
    );
  });

  describe('vendor-variance options (amoCRM)', () => {
    const amoCrmConfig = {
      tokenUrl: 'https://{accountDomain}/oauth2/access_token',
      tokenRequestFormat: 'json' as const,
      accountDomainCallbackParam: 'referer',
      includeRedirectUriOnRefresh: true,
    };
    const values: Record<string, string> = {
      access_token: 'tok-stale',
      refresh_token: 'refresh-1',
      expires_at: String(Date.now() - 1000),
      client_id: 'cid',
      client_secret: 'csecret',
      account_domain: 'my-account.amocrm.ru',
    };

    it('resolves account_domain, substitutes it into tokenUrl, sends a JSON body, and includes redirect_uri', async () => {
      vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
      vi.stubEnv('INTERNAL_PROJECT_TOKEN', 'ptok');
      vi.stubEnv('PROJECT_ID', 'project-1');
      vi.stubEnv('BACKEND_PUBLIC_URL', 'https://public.test');
      const fetchMock = vi.fn((url: string, init: RequestInit) => {
        if (url === 'https://my-account.amocrm.ru/oauth2/access_token') {
          return { ok: true, json: () => Promise.resolve({ access_token: 'tok-fresh', expires_in: 3600 }) };
        }
        if (url === 'http://backend.test/internal/credentials/oauth2-refresh') {
          return { ok: true, json: () => Promise.resolve({}) };
        }
        const body = JSON.parse(init.body as string) as { field: string };
        return {
          ok: true,
          json: () => Promise.resolve({ value: values[body.field] }),
          text: () => Promise.resolve(''),
        };
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await resolveOAuth2AccessToken('amocrm', 'cred-1', amoCrmConfig);

      expect(result).toBe('tok-fresh');
      const refreshCall = fetchMock.mock.calls.find(
        (call) => call[0] === 'https://my-account.amocrm.ru/oauth2/access_token',
      );
      expect(refreshCall).toBeTruthy();
      const headers = refreshCall?.[1]?.headers as Record<string, string>;
      expect(headers['content-type']).toBe('application/json');
      const parsedBody = JSON.parse(refreshCall?.[1]?.body as string) as Record<string, string>;
      expect(parsedBody).toMatchObject({
        grant_type: 'refresh_token',
        refresh_token: 'refresh-1',
        redirect_uri: 'https://public.test/oauth2/callback/amocrm',
        client_id: 'cid',
        client_secret: 'csecret',
      });
    });

    it('throws when includeRedirectUriOnRefresh is set but BACKEND_PUBLIC_URL is missing', async () => {
      vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
      vi.stubEnv('INTERNAL_PROJECT_TOKEN', 'ptok');
      vi.stubEnv('PROJECT_ID', 'project-1');
      stubResolveCredentials(values);

      await expect(resolveOAuth2AccessToken('amocrm', 'cred-1', amoCrmConfig)).rejects.toThrow(
        /BACKEND_PUBLIC_URL is not configured/,
      );
    });
  });
});

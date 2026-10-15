import type { IIntegrationInstance, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveOAuth2AccessToken } from './resolve-oauth2-access-token.js';

const { egressFetch } = vi.hoisted(() => ({ egressFetch: vi.fn() }));

vi.mock('../../net/egress-guard.js', () => ({ getBackendEgress: () => ({ fetch: egressFetch }) }));
vi.mock('./credentials-codec.js', () => ({
  resolveFieldValue: (_instance: unknown, field: { name: string }) =>
    ({ access_token: 'SECRET-OLD-ACCESS', refresh_token: 'SECRET-REFRESH', expires_at: '1000' })[field.name] ?? '',
}));
vi.mock('./resolve-oauth2-client-credentials.js', () => ({
  resolveOAuth2ClientCredentials: () => Promise.resolve({ clientId: 'cid', clientSecret: 'SECRET-CLIENT' }),
}));

const integrationWith = (oauth2: Record<string, unknown>): IWorkflowIntegration =>
  ({
    vendor: 'v',
    credentialFields: ['access_token', 'refresh_token', 'expires_at'].map((name) => ({ name })),
    oauth2: { tokenUrl: 'https://vendor.test/token', scope: [], ...oauth2 },
  }) as unknown as IWorkflowIntegration;

const resolve = (integration: IWorkflowIntegration, now = 5_000_000) =>
  resolveOAuth2AccessToken({} as never, integration, {} as IIntegrationInstance, Buffer.alloc(32), now);

describe('resolveOAuth2AccessToken refresh', () => {
  beforeEach(() => {
    egressFetch.mockReset();
    egressFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'new', refresh_token: 'r2', expires_in: 60 }),
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('includeRedirectUriOnRefresh without BACKEND_PUBLIC_URL fails before any request, without leaking secrets', async () => {
    vi.stubEnv('BACKEND_PUBLIC_URL', '');

    const failure = await resolve(integrationWith({ includeRedirectUriOnRefresh: true })).catch(
      (error: Error) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('BACKEND_PUBLIC_URL is not configured');
    expect((failure as Error).message).not.toMatch(/SECRET/);
    expect(egressFetch).not.toHaveBeenCalled();
  });

  it('includeRedirectUriOnRefresh with BACKEND_PUBLIC_URL sends the callback redirect_uri', async () => {
    vi.stubEnv('BACKEND_PUBLIC_URL', 'http://backend.test');

    const result = await resolve(integrationWith({ includeRedirectUriOnRefresh: true }));

    const body = egressFetch.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('redirect_uri')).toBe('http://backend.test/oauth2/callback/v');
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(result.accessToken).toBe('new');
    expect(result.refreshed?.expiresAt).toBe(String(5_000_000 + 60_000));
  });

  it('without the flag no redirect_uri is sent and a missing BACKEND_PUBLIC_URL is irrelevant', async () => {
    vi.stubEnv('BACKEND_PUBLIC_URL', '');

    await resolve(integrationWith({}));

    expect((egressFetch.mock.calls[0][1].body as URLSearchParams).has('redirect_uri')).toBe(false);
  });

  it('a failed refresh reports the status but not the tokens', async () => {
    egressFetch.mockResolvedValue({ ok: false, status: 400 });

    const failure = await resolve(integrationWith({})).catch((error: Error) => error);

    expect((failure as Error).message).toBe('OAuth2 refresh failed for "v": 400');
    expect((failure as Error).message).not.toMatch(/SECRET/);
  });

  it('a token that is not near expiry is returned without any request', async () => {
    const result = await resolve(integrationWith({}), -1_000_000);

    expect(result.accessToken).toBe('SECRET-OLD-ACCESS');
    expect(egressFetch).not.toHaveBeenCalled();
  });
});

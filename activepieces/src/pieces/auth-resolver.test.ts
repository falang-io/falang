import { describe, expect, it, vi } from 'vitest';
import type { Piece } from '@activepieces/pieces-framework';
import { resolveCredential } from '../credentials.js';
import { resolveAuthValue } from './auth-resolver.js';

vi.mock('../credentials.js', () => ({
  resolveCredential: vi.fn(),
}));

const asPiece = (auth: Record<string, unknown> | undefined): Piece => ({ auth }) as unknown as Piece;

describe('resolveAuthValue', () => {
  it('resolves SecretText auth from a single "secret_text" credential field', async () => {
    vi.mocked(resolveCredential).mockResolvedValueOnce('sk-123');
    const result = await resolveAuthValue('mySecret', asPiece({ type: 'SECRET_TEXT' }), 'cred-1', 'project-1', 'ptok');
    expect(resolveCredential).toHaveBeenCalledWith(
      'cred-1',
      'activepieces-mySecret',
      'secret_text',
      'project-1',
      'ptok',
    );
    expect(result).toEqual({ type: 'SECRET_TEXT', secret_text: 'sk-123' });
  });

  it('resolves BasicAuth from username + password credential fields, in parallel', async () => {
    vi.mocked(resolveCredential).mockImplementation(async (_id, _vendor, field) =>
      field === 'username' ? 'alice' : 'hunter2',
    );
    const result = await resolveAuthValue('myBasic', asPiece({ type: 'BASIC_AUTH' }), 'cred-1', 'project-1', 'ptok');
    expect(result).toEqual({ type: 'BASIC_AUTH', username: 'alice', password: 'hunter2' });
  });

  it('resolves CustomAuth by resolving one credential field per declared sub-prop', async () => {
    vi.mocked(resolveCredential).mockImplementation(async (_id, _vendor, field) => `value-${field}`);
    const result = await resolveAuthValue(
      'myCustom',
      asPiece({ type: 'CUSTOM_AUTH', props: { workspace: {}, apiKey: {} } }),
      'cred-1',
      'project-1',
      'ptok',
    );
    expect(result).toEqual({ type: 'CUSTOM_AUTH', props: { workspace: 'value-workspace', apiKey: 'value-apiKey' } });
  });

  it('resolves a multi-auth piece through the method selectPieceAuth picks for it (slack -> Bot Token)', async () => {
    vi.mocked(resolveCredential).mockImplementation(async (_id, _vendor, field) => `value-${field}`);
    const result = await resolveAuthValue(
      'slack',
      asPiece([
        { type: 'OAUTH2', displayName: 'Connection', tokenUrl: 'https://slack.test/token' },
        { type: 'CUSTOM_AUTH', displayName: 'Bot Token', props: { botToken: {}, userToken: {} } },
      ] as unknown as Record<string, unknown>),
      'cred-1',
      'project-1',
      'ptok',
    );
    expect(result).toEqual({
      type: 'CUSTOM_AUTH',
      props: { botToken: 'value-botToken', userToken: 'value-userToken' },
    });
  });

  it('returns undefined for a piece with no auth at all', async () => {
    const result = await resolveAuthValue('noAuth', asPiece(undefined), 'cred-1', 'project-1', 'ptok');
    expect(result).toBeUndefined();
    expect(resolveCredential).not.toHaveBeenCalled();
  });

  it('throws for an auth type this adapter does not support (e.g. OIDC)', async () => {
    await expect(resolveAuthValue('oidc', asPiece({ type: 'OIDC' }), 'cred-1', 'project-1', 'ptok')).rejects.toThrow(
      /Unsupported auth type "OIDC"/,
    );
  });

  describe('OAuth2', () => {
    const oauth2Auth = { type: 'OAUTH2', tokenUrl: 'https://vendor.test/token' };
    const credentialValues = (values: Record<string, string>) =>
      vi.mocked(resolveCredential).mockImplementation(async (_id, _vendor, field) => {
        const value = values[field];
        if (value === undefined) throw new Error(`no value stubbed for "${field}"`);
        return value;
      });

    it('resolves the bare {access_token, data} shape without refreshing when not near expiry', async () => {
      credentialValues({
        access_token: 'tok-current',
        refresh_token: 'refresh-1',
        expires_at: String(Date.now() + 10 * 60_000),
        client_id: 'cid',
        client_secret: 'csecret',
      });
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const result = await resolveAuthValue('oauth', asPiece(oauth2Auth), 'cred-1', 'project-1', 'ptok');

      expect(result).toEqual({ type: 'OAUTH2', access_token: 'tok-current', data: {} });
      expect(fetchMock).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('refreshes via the token endpoint and best-effort persists when expired', async () => {
      credentialValues({
        access_token: 'tok-stale',
        refresh_token: 'refresh-1',
        expires_at: String(Date.now() - 1000),
        client_id: 'cid',
        client_secret: 'csecret',
      });
      vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: 'tok-fresh', refresh_token: 'refresh-2', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      vi.stubGlobal('fetch', fetchMock);

      const result = await resolveAuthValue('oauth', asPiece(oauth2Auth), 'cred-1', 'project-1', 'ptok');

      expect(result).toEqual({
        type: 'OAUTH2',
        access_token: 'tok-fresh',
        data: { access_token: 'tok-fresh', refresh_token: 'refresh-2', expires_in: 3600 },
      });
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://vendor.test/token',
        expect.objectContaining({ method: 'POST' }),
      );
      const refreshBody = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
      expect(refreshBody.get('grant_type')).toBe('refresh_token');
      expect(refreshBody.get('refresh_token')).toBe('refresh-1');
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'http://backend.test/internal/credentials/oauth2-refresh',
        expect.objectContaining({
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-internal-project-token': 'ptok' },
        }),
      );
      const refreshedBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string) as Record<string, unknown>;
      expect(refreshedBody).toMatchObject({
        credentialId: 'cred-1',
        vendor: 'activepieces-oauth',
        projectId: 'project-1',
        accessToken: 'tok-fresh',
      });
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });

    it('returns the stale access token without throwing when expired but no refresh token is available', async () => {
      credentialValues({
        access_token: 'tok-stale',
        refresh_token: '',
        expires_at: String(Date.now() - 1000),
        client_id: 'cid',
        client_secret: 'csecret',
      });
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const result = await resolveAuthValue('oauth', asPiece(oauth2Auth), 'cred-1', 'project-1', 'ptok');

      expect(result).toEqual({ type: 'OAUTH2', access_token: 'tok-stale', data: {} });
      expect(fetchMock).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });
});

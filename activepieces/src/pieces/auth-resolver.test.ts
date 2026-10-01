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

    it('asks backend for the access token and never resolves client_id/client_secret or calls the vendor', async () => {
      vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ accessToken: 'tok-fresh', data: { refresh_token: 'r2' } }),
      });
      vi.stubGlobal('fetch', fetchMock);
      vi.mocked(resolveCredential).mockClear();

      const result = await resolveAuthValue('oauth', asPiece(oauth2Auth), 'cred-1', 'project-1', 'ptok');

      expect(result).toEqual({ type: 'OAUTH2', access_token: 'tok-fresh', data: { refresh_token: 'r2' } });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://backend.test/internal/credentials/oauth2-access-token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-internal-project-token': 'ptok' },
        }),
      );
      expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
        credentialId: 'cred-1',
        vendor: 'activepieces-oauth',
        projectId: 'project-1',
      });
      expect(resolveCredential).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });

    it('throws when backend refuses', async () => {
      vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, text: () => Promise.resolve('x') }));

      await expect(resolveAuthValue('oauth', asPiece(oauth2Auth), 'cred-1', 'project-1', 'ptok')).rejects.toThrow(
        /502/,
      );
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });
  });
});

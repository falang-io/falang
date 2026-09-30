import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivepiecesCatalogService } from './activepieces-catalog.service.js';
import type { OAuthCredentialsService } from '../admin/oauth-credentials/oauth-credentials.service.js';

const PIECE = { pieceName: '@activepieces/piece-slack', displayName: 'Slack', actions: [], triggers: [] };

const buildService = (env: Record<string, string | undefined>): ActivepiecesCatalogService =>
  new ActivepiecesCatalogService(
    { get: (key: string) => env[key] } as unknown as ConfigService,
    { listConfiguredVendors: () => Promise.resolve(new Set<string>()) } as unknown as OAuthCredentialsService,
  );

const CONFIGURED = { ACTIVEPIECES_SERVICE_URL: 'http://activepieces:4100', ACTIVEPIECES_SERVICE_SECRET: 'secret' };

describe('ActivepiecesCatalogService.getPieces', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not cache a failed fetch — the next call retries and caches the success', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockResolvedValue({ ok: true, json: () => Promise.resolve([PIECE]) });
    vi.stubGlobal('fetch', fetchMock);
    const service = buildService(CONFIGURED);

    await expect(service.getPieces()).resolves.toEqual([]);
    await expect(service.getPieces()).resolves.toEqual([PIECE]);
    await expect(service.getPieces()).resolves.toEqual([PIECE]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache a non-OK response either', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: () => Promise.resolve({}) })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve([PIECE]) });
    vi.stubGlobal('fetch', fetchMock);
    const service = buildService(CONFIGURED);

    await expect(service.getPieces()).resolves.toEqual([]);
    await expect(service.getPieces()).resolves.toEqual([PIECE]);
  });

  it('caches the empty list of an unconfigured service without ever fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = buildService({});

    await expect(service.getPieces()).resolves.toEqual([]);
    await expect(service.getPieces()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

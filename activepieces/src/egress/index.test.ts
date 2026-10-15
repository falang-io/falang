import http from 'node:http';
import https from 'node:https';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGlobalDispatcher } from 'undici';
import { getEgressVendor, installEgress, runWithPieceEgress } from './index.js';

describe('runWithPieceEgress', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('runs fn under the activepieces-<piece> vendor, with no fetch while routing is not installed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const vendor = await runWithPieceEgress('slack', { projectId: 'p', internalProjectToken: 't' }, async () =>
      getEgressVendor(),
    );
    expect(vendor).toBe('activepieces-slack');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('installEgress', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('installs dispatcher + agents, refreshes the config with the caller token, and dispose restores everything', async () => {
    const dispatcherBefore = getGlobalDispatcher();
    const agentsBefore = { http: http.globalAgent, https: https.globalAgent };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ proxy: { url: 'http://proxy.invalid', token: 't', vendors: ['activepieces-x'] } }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const handle = installEgress({ BACKEND_INTERNAL_URL: 'http://backend.test' } as NodeJS.ProcessEnv);
    expect(getGlobalDispatcher()).not.toBe(dispatcherBefore);
    expect(http.globalAgent).not.toBe(agentsBefore.http);

    await runWithPieceEgress('x', { projectId: 'proj', internalProjectToken: 'tok' }, async () => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe('http://backend.test/internal/egress-proxy/proj');
    expect(init.headers['x-internal-project-token']).toBe('tok');

    // Without a project id or token the cache is not asked (the request carries no identity).
    await runWithPieceEgress('x', {}, async () => undefined);
    await runWithPieceEgress('x', { projectId: 'proj' }, async () => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    handle.dispose();
    expect(getGlobalDispatcher()).toBe(dispatcherBefore);
    expect(http.globalAgent).toBe(agentsBefore.http);
    expect(https.globalAgent).toBe(agentsBefore.https);

    // After dispose the wrapper no longer refreshes.
    await runWithPieceEgress('x', { projectId: 'proj', internalProjectToken: 'tok' }, async () => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('disposing an older installation does not switch off the newer one', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ proxy: null }) }));
    vi.stubGlobal('fetch', fetchMock);
    const env = { BACKEND_INTERNAL_URL: 'http://backend.test' } as NodeJS.ProcessEnv;
    const older = installEgress(env);
    const newer = installEgress(env);
    older.dispose();
    await runWithPieceEgress('x', { projectId: 'p', internalProjectToken: 't' }, async () => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    newer.dispose();
  });
});

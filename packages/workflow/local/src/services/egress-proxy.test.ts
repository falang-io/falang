import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildEgressProxyEnv,
  buildEgressProxyTestEnv,
  createEgressProxyService,
  defaultProxyEntry,
} from './egress-proxy.js';
import type { ILocalServiceContext } from './types.js';

describe('egress-proxy service', () => {
  it('finds proxy/src/main.ts of this checkout', () => {
    expect(defaultProxyEntry().replaceAll('\\', '/')).toMatch(/\/proxy\/src\/main\.ts$/);
    expect(existsSync(defaultProxyEntry())).toBe(true);
  });

  it('opens every port and the stats route only in test mode', () => {
    expect(buildEgressProxyEnv({ port: 4301, token: 't', testMode: true })).toEqual({
      HTTP_PORT: '4301',
      PROXY_TOKENS: 't',
      PROXY_ALLOWED_PORTS: '*',
      PROXY_EXPOSE_STATS: 'true',
    });
    expect(buildEgressProxyEnv({ port: 4301, token: 't', testMode: false })).toEqual({
      HTTP_PORT: '4301',
      PROXY_TOKENS: 't',
    });
  });

  it('gives the tests the proxy URL, token and stats URL', () => {
    expect(buildEgressProxyTestEnv(4301, 'tok')).toEqual({
      E2E_PROXY_URL: 'http://127.0.0.1:4301',
      E2E_PROXY_TOKEN: 'tok',
      E2E_PROXY_STATS_URL: 'http://127.0.0.1:4301',
    });
  });

  it('fails clearly without a proxy/ checkout', async () => {
    const service = createEgressProxyService({ entry: '/nowhere/proxy/src/main.ts', exists: () => false });
    const ctx = { childEnv: {} } as unknown as ILocalServiceContext;
    await expect(service.start(ctx)).rejects.toThrow(/\/nowhere\/proxy\/src\/main\.ts not found.*FALANG_PROXY_ENTRY/);
  });
});

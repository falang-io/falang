/* oxlint-disable require-await */
import type * as UndiciModule from 'undici';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EgressBlockedError, createBackendEgress, loadEgressPolicy, type TLookupAll } from './egress-guard.js';

const { undiciFetch, wouldProxy } = vi.hoisted(() => ({ undiciFetch: vi.fn(), wouldProxy: vi.fn() }));

vi.mock('undici', async (importOriginal) => ({
  ...(await importOriginal<typeof UndiciModule>()),
  fetch: undiciFetch,
}));
vi.mock('@falang/workflow-egress', () => ({ wouldProxyRequest: wouldProxy }));

const strict = loadEgressPolicy({});
const lookup =
  (addresses: Record<string, string[]>): TLookupAll =>
  async (host) =>
    (addresses[host] ?? []).map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

describe('createBackendEgress for a vendor routed through the egress proxy', () => {
  beforeEach(() => {
    undiciFetch.mockReset();
    undiciFetch.mockResolvedValue({ status: 200 });
    wouldProxy.mockReset();
    wouldProxy.mockReturnValue(true);
  });

  it('lets a name the backend cannot resolve through (the proxy resolves it) and uses the global dispatcher', async () => {
    const egress = createBackendEgress({ policy: () => strict, lookupAll: lookup({}) });

    await egress.fetch('https://api.only-the-proxy-knows.example/v1');

    expect(undiciFetch).toHaveBeenCalledTimes(1);
    expect(undiciFetch.mock.calls[0]?.[1]).not.toHaveProperty('dispatcher');
  });

  it('still blocks a name that resolves to a private address, before anything is sent', async () => {
    const egress = createBackendEgress({
      policy: () => strict,
      lookupAll: lookup({ 'evil.example': ['169.254.169.254'] }),
    });

    await expect(egress.fetch('https://evil.example/')).rejects.toBeInstanceOf(EgressBlockedError);
    expect(undiciFetch).not.toHaveBeenCalled();
  });

  it('blocks when ANY resolved address is private', async () => {
    const egress = createBackendEgress({
      policy: () => strict,
      lookupAll: lookup({ 'mixed.example': ['93.184.216.34', '10.0.0.5'] }),
    });

    await expect(egress.fetch('https://mixed.example/')).rejects.toBeInstanceOf(EgressBlockedError);
    expect(undiciFetch).not.toHaveBeenCalled();
  });

  it.each(['http://127.0.0.1/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://169.254.169.254/latest'])(
    'always checks the IP literal %s, even though the proxy would connect',
    async (url) => {
      const egress = createBackendEgress({ policy: () => strict, lookupAll: lookup({}) });

      await expect(egress.fetch(url)).rejects.toBeInstanceOf(EgressBlockedError);
      expect(undiciFetch).not.toHaveBeenCalled();
    },
  );

  it('lets a public IP literal through', async () => {
    const egress = createBackendEgress({ policy: () => strict, lookupAll: lookup({}) });

    await egress.fetch('http://93.184.216.34/');

    expect(undiciFetch).toHaveBeenCalledTimes(1);
  });

  it('a non-proxied request still uses the guarded dispatcher', async () => {
    wouldProxy.mockReturnValue(false);
    const egress = createBackendEgress({
      policy: () => strict,
      lookupAll: lookup({ 'ok.example': ['93.184.216.34'] }),
    });

    await egress.fetch('https://ok.example/');

    expect(undiciFetch.mock.calls[0]?.[1]).toHaveProperty('dispatcher');
  });
});

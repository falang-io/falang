import { X509Certificate } from 'node:crypto';
import tls from 'node:tls';
import type * as UndiciModule from 'undici';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const created = vi.hoisted(() => ({ agents: [] as unknown[], proxies: [] as Record<string, unknown>[] }));

vi.mock('undici', async () => {
  const actual = await vi.importActual<typeof UndiciModule>('undici');
  // Constructors returning the real instance, so only the options are recorded.
  const SpyAgent = function SpyAgent(opts: unknown) {
    created.agents.push(opts);
    return new actual.Agent(opts as never);
  };
  const SpyProxyAgent = function SpyProxyAgent(opts: unknown) {
    created.proxies.push(opts as Record<string, unknown>);
    return new actual.ProxyAgent(opts as never);
  };
  return { ...actual, Agent: SpyAgent, ProxyAgent: SpyProxyAgent };
});

import {
  RUSSIAN_TRUSTED_ROOT_CA_PEM,
  RUSSIAN_TRUSTED_SUB_CA_2024_PEM,
  RUSSIAN_TRUSTED_SUB_CA_PEM,
} from './certs/russian-trusted-ca.js';
import { createEgressDispatcher, runWithEgressVendor, VENDOR_EXTRA_CA, buildVendorCa } from './index.js';

const fingerprint = (pem: string): string => new X509Certificate(pem).fingerprint256;

describe('Russian Trusted CA constants', () => {
  it('match the published fingerprints', () => {
    expect(fingerprint(RUSSIAN_TRUSTED_ROOT_CA_PEM)).toBe(
      'D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31',
    );
    expect(fingerprint(RUSSIAN_TRUSTED_SUB_CA_PEM)).toBe(
      'BB:BD:E2:10:3E:79:0B:99:9E:C6:2B:D0:3C:F6:25:A5:A2:E7:C3:16:E1:0A:FE:6A:49:0E:ED:EA:D8:B3:FD:9B',
    );
    expect(fingerprint(RUSSIAN_TRUSTED_SUB_CA_2024_PEM)).toBe(
      '21:55:78:50:36:C9:00:DB:B5:F1:BB:2A:15:69:C8:0C:55:59:5B:D6:BF:94:86:7A:29:BB:DD:BC:7D:88:A3:F2',
    );
  });

  it('subs are issued by the root', () => {
    const root = new X509Certificate(RUSSIAN_TRUSTED_ROOT_CA_PEM);
    for (const pem of [RUSSIAN_TRUSTED_SUB_CA_PEM, RUSSIAN_TRUSTED_SUB_CA_2024_PEM]) {
      expect(new X509Certificate(pem).verify(root.publicKey)).toBe(true);
    }
  });
});

describe('vendor extra CA', () => {
  it('only max gets extra roots, on top of the default ones', () => {
    expect(Object.keys(VENDOR_EXTRA_CA)).toEqual(['max']);
    const ca = buildVendorCa('max');
    expect(ca).toEqual([...tls.rootCertificates, ...VENDOR_EXTRA_CA.max]);
    expect(buildVendorCa('telegram')).toBeNull();
    expect(buildVendorCa(null)).toBeNull();
  });

  const dispatchOnce = async (vendor: string | null, proxy: boolean): Promise<void> => {
    const dispatcher = createEgressDispatcher({
      getConfig: () => (proxy ? { url: 'http://127.0.0.1:1', token: 't', vendors: ['max', 'telegram'] } : null),
      isInternal: () => false,
    });
    const run = () => {
      try {
        dispatcher.dispatch({ origin: 'https://example.invalid', path: '/', method: 'GET' }, {} as never);
      } catch {
        // the handler is a stub; only agent construction matters
      }
    };
    if (vendor) runWithEgressVendor(vendor, run);
    else run();
    await dispatcher.destroy();
  };

  beforeEach(() => {
    created.agents.length = 0;
    created.proxies.length = 0;
  });

  it('direct: max gets its own agent with extra CA, others do not', async () => {
    await dispatchOnce('telegram', false);
    await dispatchOnce(null, false);
    // only the shared `direct` agents
    expect(created.agents.filter((o) => (o as { connect?: unknown } | undefined)?.connect)).toHaveLength(0);
    await dispatchOnce('max', false);
    const withCa = created.agents.filter((o) => (o as { connect?: unknown } | undefined)?.connect) as {
      connect: { ca: string[] };
    }[];
    expect(withCa).toHaveLength(1);
    expect(withCa[0].connect.ca).toContain(RUSSIAN_TRUSTED_ROOT_CA_PEM);
    expect(withCa[0].connect.ca.length).toBeGreaterThan(tls.rootCertificates.length);
  });

  it('proxy: max passes requestTls.ca, others do not', async () => {
    await dispatchOnce('telegram', true);
    expect(created.proxies).toHaveLength(1);
    expect(created.proxies[0].requestTls).toBeUndefined();
    await dispatchOnce('max', true);
    expect(created.proxies).toHaveLength(2);
    expect((created.proxies[1].requestTls as { ca: string[] }).ca).toContain(RUSSIAN_TRUSTED_ROOT_CA_PEM);
  });
});

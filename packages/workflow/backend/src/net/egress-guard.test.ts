/* oxlint-disable no-undefined, require-await, no-await-expression-member, no-promise-executor-return, consistent-function-scoping */
import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  EgressBlockedError,
  classifyIp,
  createBackendEgress,
  createGuardedLookup,
  loadEgressPolicy,
  resolveSafeAddress,
  type IEgressPolicy,
  type TLookupAll,
} from './egress-guard.js';

const strict: IEgressPolicy = loadEgressPolicy({});
const fakeLookup =
  (addresses: Record<string, string[]>): TLookupAll =>
  async (host) =>
    (addresses[host] ?? []).map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

describe('classifyIp', () => {
  it.each([
    '127.0.0.1',
    '127.5.5.5',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '100.64.0.1',
    '100.127.255.255',
    '169.254.169.254',
    '0.0.0.0',
    '0.1.2.3',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:7f00:1',
  ])('blocks %s', (address) => {
    expect(classifyIp(address)).not.toBeNull();
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1', '100.63.0.1', '2606:4700:4700::1111'])(
    'allows public %s',
    (address) => {
      expect(classifyIp(address)).toBeNull();
    },
  );

  it('rejects a non-IP string', () => {
    expect(classifyIp('example.com')).not.toBeNull();
  });
});

describe('resolveSafeAddress', () => {
  it('returns a public answer', async () => {
    const result = await resolveSafeAddress(
      'db.example.com',
      strict,
      fakeLookup({ 'db.example.com': ['93.184.216.34'] }),
    );
    expect(result.address).toBe('93.184.216.34');
  });

  it('refuses a name that resolves to a private address', async () => {
    await expect(
      resolveSafeAddress('evil.example.com', strict, fakeLookup({ 'evil.example.com': ['10.1.2.3'] })),
    ).rejects.toBeInstanceOf(EgressBlockedError);
  });

  it('refuses when ANY answer is private (a mixed A set must not slip through)', async () => {
    await expect(
      resolveSafeAddress(
        'mixed.example.com',
        strict,
        fakeLookup({ 'mixed.example.com': ['93.184.216.34', '169.254.169.254'] }),
      ),
    ).rejects.toBeInstanceOf(EgressBlockedError);
  });

  it('refuses IP literals in blocked ranges without a DNS lookup', async () => {
    await expect(resolveSafeAddress('169.254.169.254', strict, fakeLookup({}))).rejects.toBeInstanceOf(
      EgressBlockedError,
    );
    await expect(resolveSafeAddress('[::1]', strict, fakeLookup({}))).rejects.toBeInstanceOf(EgressBlockedError);
  });

  it('refuses a name that does not resolve at all', async () => {
    await expect(resolveSafeAddress('nope.example.com', strict, fakeLookup({}))).rejects.toBeInstanceOf(
      EgressBlockedError,
    );
  });

  it('EGRESS_ALLOW_PRIVATE=true lifts every restriction', async () => {
    const policy = loadEgressPolicy({ EGRESS_ALLOW_PRIVATE: 'true' });
    expect((await resolveSafeAddress('127.0.0.1', policy, fakeLookup({}))).address).toBe('127.0.0.1');
  });

  it('EGRESS_ALLOWED_CIDRS allows only the listed ranges', async () => {
    const policy = loadEgressPolicy({ EGRESS_ALLOWED_CIDRS: '172.18.0.0/16, 10.9.9.9' });
    expect((await resolveSafeAddress('172.18.0.1', policy, fakeLookup({}))).address).toBe('172.18.0.1');
    expect((await resolveSafeAddress('10.9.9.9', policy, fakeLookup({}))).address).toBe('10.9.9.9');
    await expect(resolveSafeAddress('10.9.9.10', policy, fakeLookup({}))).rejects.toBeInstanceOf(EgressBlockedError);
    await expect(resolveSafeAddress('127.0.0.1', policy, fakeLookup({}))).rejects.toBeInstanceOf(EgressBlockedError);
  });

  it('rejects a malformed EGRESS_ALLOWED_CIDRS entry', () => {
    expect(() => loadEgressPolicy({ EGRESS_ALLOWED_CIDRS: 'not-a-cidr' })).toThrow();
    expect(() => loadEgressPolicy({ EGRESS_ALLOWED_CIDRS: '10.0.0.0/99' })).toThrow();
  });
});

describe('createGuardedLookup (DNS-rebinding protection: only checked addresses reach the socket)', () => {
  const run = (
    lookup: ReturnType<typeof createGuardedLookup>,
    host: string,
    options: { all?: boolean },
  ): Promise<{ error: Error | null; address: unknown }> =>
    new Promise((resolve) => lookup(host, options, (error, address) => resolve({ error, address })));

  it('hands out a public address (single and `all` forms)', async () => {
    const lookup = createGuardedLookup(() => strict, fakeLookup({ 'a.example.com': ['93.184.216.34'] }));
    expect((await run(lookup, 'a.example.com', {})).address).toBe('93.184.216.34');
    expect((await run(lookup, 'a.example.com', { all: true })).address).toEqual([
      { address: '93.184.216.34', family: 4 },
    ]);
  });

  it('errors instead of returning a private address', async () => {
    const lookup = createGuardedLookup(() => strict, fakeLookup({ 'a.example.com': ['127.0.0.1'] }));
    expect((await run(lookup, 'a.example.com', {})).error).toBeInstanceOf(EgressBlockedError);
    expect((await run(lookup, 'a.example.com', { all: true })).error).toBeInstanceOf(EgressBlockedError);
  });
});

describe('createBackendEgress', () => {
  const withServer = async (handler: RequestListener, body: (port: number) => Promise<void>): Promise<void> => {
    const server = createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      await body((server.address() as AddressInfo).port);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  };

  it('refuses a loopback target by default', async () => {
    await withServer(
      (_request, response) => response.end('secret'),
      async (port) => {
        const egress = createBackendEgress({ policy: () => strict });
        await expect(egress.fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
      },
    );
  });

  it('refuses a hostname that resolves to loopback', async () => {
    await withServer(
      (_request, response) => response.end('secret'),
      async (port) => {
        const egress = createBackendEgress({
          policy: () => strict,
          lookupAll: fakeLookup({ 'rebind.example.com': ['127.0.0.1'] }),
        });
        await expect(egress.fetch(`http://rebind.example.com:${port}/`)).rejects.toThrow();
      },
    );
  });

  it('connects when the policy allows private addresses', async () => {
    await withServer(
      (_request, response) => response.end('ok'),
      async (port) => {
        const egress = createBackendEgress({ policy: () => loadEgressPolicy({ EGRESS_ALLOW_PRIVATE: 'true' }) });
        const response = await egress.fetch(`http://127.0.0.1:${port}/`);
        expect(await response.text()).toBe('ok');
      },
    );
  });

  it('never follows redirects', async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' });
        response.end();
      },
      async (port) => {
        const egress = createBackendEgress({ policy: () => loadEgressPolicy({ EGRESS_ALLOW_PRIVATE: 'true' }) });
        await expect(egress.fetch(`http://127.0.0.1:${port}/`)).rejects.toBeInstanceOf(EgressBlockedError);
      },
    );
  });

  it('refuses non-http protocols', async () => {
    const egress = createBackendEgress({ policy: () => loadEgressPolicy({ EGRESS_ALLOW_PRIVATE: 'true' }) });
    await expect(egress.fetch('file:///etc/passwd')).rejects.toBeInstanceOf(EgressBlockedError);
  });

  it('resolveHost returns a checked address or throws', async () => {
    const egress = createBackendEgress({
      policy: () => strict,
      lookupAll: fakeLookup({ 'ok.example.com': ['93.184.216.34'], 'bad.example.com': ['192.168.0.5'] }),
    });
    expect(await egress.resolveHost('ok.example.com')).toBe('93.184.216.34');
    await expect(egress.resolveHost('bad.example.com')).rejects.toBeInstanceOf(EgressBlockedError);
  });
});

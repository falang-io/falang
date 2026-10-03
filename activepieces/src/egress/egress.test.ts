import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createEgressConfigCache } from './config-cache.js';
import { installEgressDispatcher } from './egress-dispatcher.js';
import { createInternalOriginMatcher } from './internal-origin.js';
import { TEST_TLS_CERT, TEST_TLS_KEY } from './test-tls-fixture.js';
import { installEgressAgents } from './tunnel-agents.js';
import { runWithEgressVendor } from './vendor-context.js';
import type { IEgressProxyConfig } from './types.js';

const TOKEN = 's3cret';
const closers: Array<() => void> = [];
const listen = async <T extends net.Server>(server: T): Promise<number> => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => server.close());
  return (server.address() as AddressInfo).port;
};

/** A minimal CONNECT proxy: checks the Bearer token, records authorities, pipes bytes to the target. */
const startProxy = async (): Promise<{ port: number; connects: string[]; badAuth: number }> => {
  const state = { port: 0, connects: [] as string[], badAuth: 0 };
  const server = http.createServer((_req, res) => res.writeHead(405).end());
  server.on('connect', (req, clientSocket, head) => {
    if (req.headers['proxy-authorization'] !== `Bearer ${TOKEN}`) {
      state.badAuth += 1;
      clientSocket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
      return;
    }
    state.connects.push(req.url ?? '');
    const [host, port] = (req.url ?? '').split(':');
    const upstream = net.connect(Number(port), host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });
  state.port = await listen(server);
  return state;
};

const get = (url: string, options: https.RequestOptions = {}): Promise<string> =>
  new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    // No explicit agent: exactly how axios issues requests.
    const req = mod.get(url, { ...options, ca: TEST_TLS_CERT }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
  });

describe('egress routing', () => {
  let httpTarget = 0;
  let httpsTarget = 0;
  let proxy: Awaited<ReturnType<typeof startProxy>>;
  let config: IEgressProxyConfig | null;
  let isInternal: (url: URL) => boolean = () => false;
  const disposers: Array<{ dispose(): void }> = [];

  beforeAll(async () => {
    httpTarget = await listen(http.createServer((_req, res) => res.end('plain-ok')));
    httpsTarget = await listen(
      https.createServer({ cert: TEST_TLS_CERT, key: TEST_TLS_KEY }, (_req, res) => res.end('tls-ok')),
    );
    proxy = await startProxy();
  });
  afterEach(() => {
    while (disposers.length) disposers.pop()?.dispose();
    proxy.connects.length = 0;
    proxy.badAuth = 0;
    isInternal = () => false;
  });
  afterAll(() => closers.forEach((close) => close()));

  const install = (): void => {
    const options = { getConfig: () => config, isInternal: (url: URL) => isInternal(url) };
    disposers.push(installEgressAgents(options), installEgressDispatcher(options));
  };
  const proxied = (vendors = ['activepieces-demo']): IEgressProxyConfig => ({
    url: `http://127.0.0.1:${proxy.port}`,
    token: TOKEN,
    vendors,
  });

  it('http.request without an agent tunnels through the proxy inside a proxied vendor context', async () => {
    config = proxied();
    install();
    const body = await runWithEgressVendor('activepieces-demo', () => get(`http://127.0.0.1:${httpTarget}/`));
    expect(body).toBe('plain-ok');
    expect(proxy.connects).toEqual([`127.0.0.1:${httpTarget}`]);
  });

  it('goes direct without a vendor context, for an unlisted vendor, without config, and for internal origins', async () => {
    install();
    config = proxied();
    await get(`http://127.0.0.1:${httpTarget}/`);
    await runWithEgressVendor('activepieces-other', () => get(`http://127.0.0.1:${httpTarget}/`));
    isInternal = createInternalOriginMatcher([`http://127.0.0.1:${httpTarget}`]);
    await runWithEgressVendor('activepieces-demo', () => get(`http://127.0.0.1:${httpTarget}/`));
    isInternal = () => false;
    config = null;
    await runWithEgressVendor('activepieces-demo', () => get(`http://127.0.0.1:${httpTarget}/`));
    expect(proxy.connects).toEqual([]);
  });

  it('does not reuse a kept-alive tunnel for a later direct request to the same host', async () => {
    config = proxied();
    install();
    await runWithEgressVendor('activepieces-demo', () => get(`http://127.0.0.1:${httpTarget}/`));
    await get(`http://127.0.0.1:${httpTarget}/`);
    expect(proxy.connects).toHaveLength(1);
  });

  it('tunnels https (TLS terminated at the target, over the CONNECT tunnel)', async () => {
    config = proxied();
    install();
    const body = await runWithEgressVendor('activepieces-demo', () => get(`https://localhost:${httpsTarget}/`));
    expect(body).toBe('tls-ok');
    expect(proxy.connects).toEqual([`localhost:${httpsTarget}`]);
  });

  it('https goes direct outside a proxied context', async () => {
    config = proxied();
    install();
    expect(await get(`https://localhost:${httpsTarget}/`)).toBe('tls-ok');
    expect(proxy.connects).toEqual([]);
  });

  it('surfaces a refused CONNECT (wrong token) as a request error', async () => {
    config = { ...proxied(), token: 'wrong' };
    install();
    await expect(
      runWithEgressVendor('activepieces-demo', () => get(`http://127.0.0.1:${httpTarget}/`)),
    ).rejects.toThrow(/refused CONNECT/);
    expect(proxy.badAuth).toBe(1);
  });

  it('global fetch is routed through the proxy dispatcher inside a proxied context, direct otherwise', async () => {
    config = proxied();
    install();
    const direct = await fetch(`http://127.0.0.1:${httpTarget}/`);
    expect(await direct.text()).toBe('plain-ok');
    expect(proxy.connects).toEqual([]);
    const viaProxy = await runWithEgressVendor('activepieces-demo', async () => {
      const response = await fetch(`http://127.0.0.1:${httpTarget}/`);
      return response.text();
    });
    expect(viaProxy).toBe('plain-ok');
    expect(proxy.connects).toEqual([`127.0.0.1:${httpTarget}`]);
    isInternal = createInternalOriginMatcher([`http://127.0.0.1:${httpTarget}`]);
    await runWithEgressVendor('activepieces-demo', () =>
      fetch(`http://127.0.0.1:${httpTarget}/`).then((r) => r.text()),
    );
    expect(proxy.connects).toHaveLength(1);
  });

  it('config cache: 30s TTL, own token, keeps the last good value on failure', async () => {
    let now = 0;
    let calls = 0;
    let fail = false;
    const seen: string[] = [];
    const cache = createEgressConfigCache({
      backendUrl: 'http://backend/',
      now: () => now,
      fetchImpl: (async (url: string, init: { headers: Record<string, string> }) => {
        calls += 1;
        seen.push(`${url} ${init.headers['x-internal-project-token']}`);
        if (fail) throw new Error('down');
        return { ok: true, json: async () => ({ proxy: proxied() }) };
      }) as unknown as typeof fetch,
    });
    expect(cache.get()).toBeNull();
    await cache.refresh('p1', 't1');
    await cache.refresh('p2', 't2');
    expect(calls).toBe(1);
    expect(seen[0]).toBe('http://backend/internal/egress-proxy/p1 t1');
    expect(cache.get()?.token).toBe(TOKEN);
    now = 31_000;
    fail = true;
    await cache.refresh('p2', 't2');
    expect(calls).toBe(2);
    expect(cache.get()?.token).toBe(TOKEN);
  });
});

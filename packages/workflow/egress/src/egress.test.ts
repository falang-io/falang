// oxlint-disable no-undefined, no-promise-executor-return, require-await, init-declarations, no-void, consistent-function-scoping, no-await-expression-member, prefer-response-static-json -- test scaffolding with real sockets
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import net from 'node:net';
import { getGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createEgressConfigPoller,
  createInternalOriginMatcher,
  fetchEgressProxyConfig,
  getEgressVendor,
  installEgressRouting,
  runWithEgressVendor,
  type IEgressProxyConfig,
} from './index.js';

interface ITestProxy {
  url: string;
  tunnels: string[];
  absolute: string[];
  close(): Promise<void>;
}

/** Minimal forward proxy: CONNECT tunnels (and absolute-URI requests, in case undici uses them for http targets). */
const startProxy = async (token: string): Promise<ITestProxy> => {
  const tunnels: string[] = [];
  const absolute: string[] = [];
  const sockets = new Set<{ destroy(): unknown }>();
  const authorized = (header: string | undefined) => header === `Bearer ${token}`;
  const server = http.createServer((req, res) => {
    if (!authorized(req.headers['proxy-authorization'] as string | undefined)) {
      res.writeHead(407).end();
      return;
    }
    absolute.push(req.url ?? '');
    const target = new URL(req.url ?? '');
    const upstream = http.request(
      { host: target.hostname, port: target.port, path: target.pathname + target.search, method: req.method },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    req.pipe(upstream);
  });
  server.on('connect', (req, clientSocket, head) => {
    if (!authorized(req.headers['proxy-authorization'] as string | undefined)) {
      clientSocket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
      return;
    }
    tunnels.push(req.url ?? '');
    const [host, port] = (req.url ?? '').split(':');
    const upstream = net.connect(Number(port), host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    sockets.add(upstream);
    sockets.add(clientSocket);
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    tunnels,
    absolute,
    close: () =>
      new Promise<void>((r) => {
        for (const s of sockets) s.destroy();
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
};

const startTarget = async () => {
  const server = http.createServer((_req, res) => res.end('ok'));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    url: `http://127.0.0.1:${port}/x`,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
};

describe('egress routing', () => {
  let proxy: ITestProxy;
  let proxy2: ITestProxy;
  let target: Awaited<ReturnType<typeof startTarget>>;
  let config: IEgressProxyConfig | null;
  let isInternal: (url: URL) => boolean;
  let installed: { dispose(): void } | undefined;
  const hits = (p: ITestProxy) => p.tunnels.length + p.absolute.length;

  beforeEach(async () => {
    proxy = await startProxy('t1');
    proxy2 = await startProxy('t2');
    target = await startTarget();
    config = { url: proxy.url, token: 't1', vendors: ['telegram'] };
    isInternal = () => false;
    installed = installEgressRouting({ getConfig: () => config, isInternal: (u) => isInternal(u) });
  });

  afterEach(async () => {
    installed?.dispose();
    await Promise.all([proxy.close(), proxy2.close(), target.close()]);
  });

  const get = async (): Promise<string> => (await fetch(target.url)).text();

  it('goes direct without a config', async () => {
    config = null;
    expect(await runWithEgressVendor('telegram', get)).toBe('ok');
    expect(hits(proxy)).toBe(0);
  });

  it('goes through the proxy for a listed vendor (global fetch)', async () => {
    expect(await runWithEgressVendor('telegram', get)).toBe('ok');
    expect(hits(proxy)).toBeGreaterThan(0);
  });

  it('goes direct for an unlisted vendor and without a vendor context', async () => {
    expect(await runWithEgressVendor('openai', get)).toBe('ok');
    expect(await get()).toBe('ok');
    expect(hits(proxy)).toBe(0);
  });

  it('never proxies internal origins', async () => {
    isInternal = createInternalOriginMatcher([`http://127.0.0.1:${target.port}`]);
    expect(await runWithEgressVendor('telegram', get)).toBe('ok');
    expect(hits(proxy)).toBe(0);
  });

  it('switches to a new proxy when the config changes', async () => {
    await runWithEgressVendor('telegram', get);
    config = { url: proxy2.url, token: 't2', vendors: ['telegram'] };
    expect(await runWithEgressVendor('telegram', get)).toBe('ok');
    expect(hits(proxy2)).toBeGreaterThan(0);
  });

  it('propagates the vendor through timers and promise chains', async () => {
    const seen = await runWithEgressVendor('telegram', async () => {
      await new Promise((r) => setTimeout(r, 5));
      return getEgressVendor();
    });
    expect(seen).toBe('telegram');
    await runWithEgressVendor('telegram', async () => {
      await new Promise((r) => setTimeout(r, 5));
      await Promise.resolve();
      await get();
    });
    expect(hits(proxy)).toBeGreaterThan(0);
    expect(getEgressVendor()).toBeUndefined();
  });

  it('dispose restores the previous global dispatcher', () => {
    const during = getGlobalDispatcher();
    installed?.dispose();
    installed = undefined;
    expect(getGlobalDispatcher()).not.toBe(during);
  });
});

describe('createInternalOriginMatcher', () => {
  it('normalises default ports and ignores junk', () => {
    const match = createInternalOriginMatcher([undefined, 'not a url', 'http://backend', 'https://svc:443/path']);
    expect(match(new URL('http://backend:80/x'))).toBe(true);
    expect(match(new URL('https://svc/y'))).toBe(true);
    expect(match(new URL('http://backend:8080/x'))).toBe(false);
    expect(match(new URL('https://backend/x'))).toBe(false);
  });
});

describe('createEgressConfigPoller', () => {
  const cfg: IEgressProxyConfig = { url: 'http://p', token: 't', vendors: ['a'] };

  it('keeps the last good value when a load fails', async () => {
    let fail = false;
    const poller = createEgressConfigPoller({
      load: async () => {
        if (fail) throw new Error('boom');
        return cfg;
      },
      intervalMs: 10,
    });
    await poller.ready;
    expect(poller.get()).toEqual(cfg);
    fail = true;
    await new Promise((r) => setTimeout(r, 40));
    expect(poller.get()).toEqual(cfg);
    poller.dispose();
  });

  it('ready resolves even if the first load fails', async () => {
    const poller = createEgressConfigPoller({
      load: async () => {
        throw new Error('boom');
      },
    });
    await expect(poller.ready).resolves.toBeUndefined();
    expect(poller.get()).toBeNull();
    poller.dispose();
  });
});

describe('fetchEgressProxyConfig', () => {
  it('sends the token and returns body.proxy', async () => {
    let seen: { url: string; token: string | null } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, token: new Headers(init.headers).get('x-internal-project-token') };
      return new Response(JSON.stringify({ proxy: { url: 'http://p', token: 't', vendors: [] } }));
    }) as unknown as typeof fetch;
    const result = await fetchEgressProxyConfig({
      backendUrl: 'http://backend/',
      projectId: 'p1',
      projectToken: 'tok',
      fetchImpl,
    });
    expect(seen).toEqual({ url: 'http://backend/internal/egress-proxy/p1', token: 'tok' });
    expect(result?.url).toBe('http://p');
  });

  it('throws on non-2xx', async () => {
    const fetchImpl = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    await expect(
      fetchEgressProxyConfig({ backendUrl: 'http://b', projectId: 'p', projectToken: 't', fetchImpl }),
    ).rejects.toThrow();
  });
});

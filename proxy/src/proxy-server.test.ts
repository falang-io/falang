import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProxyAgent } from 'undici';
import { fetch as undiciFetch } from 'undici';
import { extractToken, isAuthorized, parseTokens } from './auth.js';
import { createProxyServer, type IProxyServerOptions } from './proxy-server.js';

const TOKEN = 'secret-token';
const closers: Array<() => Promise<void>> = [];

const listen = async (server: net.Server): Promise<number> => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(
    () =>
      new Promise<void>((resolve) => {
        if ('closeAllConnections' in server) {
          (server as http.Server).closeAllConnections();
        }
        server.close(() => resolve());
      }),
  );
  return (server.address() as AddressInfo).port;
};

const startProxy = (extra: Partial<IProxyServerOptions> = {}): Promise<number> =>
  listen(createProxyServer({ tokens: [TOKEN], allowedPorts: '*', log: () => {}, ...extra }));

let target: { port: number; seen: http.IncomingHttpHeaders[] };

beforeEach(async () => {
  const seen: http.IncomingHttpHeaders[] = [];
  const server = http.createServer((req, res) => {
    seen.push(req.headers);
    res.setHeader('x-echo', 'yes');
    res.end(`hello ${req.url}`);
  });
  target = { port: await listen(server), seen };
});

afterEach(async () => {
  while (closers.length > 0) {
    await closers.pop()!();
  }
});

/** Sends a raw request over a socket to the proxy and returns everything until close (or after `until`). */
const rawRequest = (port: number, payload: string, until?: RegExp): Promise<string> =>
  new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(payload));
    let data = '';
    socket.on('data', (chunk) => {
      data += chunk.toString();
      if (until?.test(data)) {
        socket.destroy();
        resolve(data);
      }
    });
    socket.on('close', () => resolve(data));
    socket.on('error', reject);
  });

const connectAndGet = (proxyPort: number, authHeader: string | null, targetPort: number): Promise<string> => {
  const auth = authHeader ? `Proxy-Authorization: ${authHeader}\r\n` : '';
  return rawRequest(
    proxyPort,
    `CONNECT 127.0.0.1:${targetPort} HTTP/1.1\r\nHost: 127.0.0.1:${targetPort}\r\n${auth}\r\n` +
      `GET /tunnel HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`,
    /hello \/tunnel/,
  );
};

const getStats = (port: number, auth: string): Promise<{ status: number; json(): Promise<unknown> }> =>
  new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: '/__stats', headers: { 'Proxy-Authorization': auth } }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, json: async () => JSON.parse(body) }));
      })
      .on('error', reject);
  });

describe('auth helpers', () => {
  it('parses tokens', () => {
    expect(parseTokens(' a, b ,,c ')).toEqual(['a', 'b', 'c']);
    expect(parseTokens(undefined)).toEqual([]);
  });
  it('extracts bearer and basic', () => {
    expect(extractToken('Bearer abc')).toBe('abc');
    expect(extractToken(`Basic ${Buffer.from('user:abc').toString('base64')}`)).toBe('abc');
    expect(extractToken('Digest x')).toBeNull();
    expect(isAuthorized('Bearer abcd', ['abc'])).toBe(false);
    expect(isAuthorized('Bearer abc', ['x', 'abc'])).toBe(true);
  });
});

describe('proxy server', () => {
  it('tunnels CONNECT with Bearer', async () => {
    const proxy = await startProxy();
    const out = await connectAndGet(proxy, `Bearer ${TOKEN}`, target.port);
    expect(out).toContain('200 Connection Established');
    expect(out).toContain('hello /tunnel');
  });

  it('tunnels CONNECT with Basic', async () => {
    const proxy = await startProxy();
    const basic = `Basic ${Buffer.from(`anyone:${TOKEN}`).toString('base64')}`;
    const out = await connectAndGet(proxy, basic, target.port);
    expect(out).toContain('hello /tunnel');
  });

  it('rejects CONNECT with a wrong or missing token (407)', async () => {
    const proxy = await startProxy();
    for (const header of ['Bearer nope', null]) {
      const out = await connectAndGet(proxy, header, target.port);
      expect(out).toContain('407 Proxy Authentication Required');
      expect(out).toContain('Proxy-Authenticate: Basic realm="falang-proxy"');
      expect(out).not.toContain('hello');
    }
  });

  it('rejects a disallowed port with 403', async () => {
    const proxy = await startProxy({ allowedPorts: [443] });
    const out = await connectAndGet(proxy, `Bearer ${TOKEN}`, target.port);
    expect(out).toContain('403 Forbidden');
  });

  it('answers 502 when the upstream is unreachable', async () => {
    const proxy = await startProxy();
    const free = net.createServer();
    await new Promise<void>((resolve) => free.listen(0, '127.0.0.1', resolve));
    const closedPort = (free.address() as AddressInfo).port;
    await new Promise<void>((resolve) => free.close(() => resolve()));
    const out = await connectAndGet(proxy, `Bearer ${TOKEN}`, closedPort);
    expect(out).toContain('502 Bad Gateway');
  });

  it('forwards absolute-URI HTTP and strips proxy-authorization', async () => {
    const proxy = await startProxy();
    const out = await rawRequest(
      proxy,
      `GET http://127.0.0.1:${target.port}/abs?x=1 HTTP/1.1\r\nHost: 127.0.0.1:${target.port}\r\n` +
        `Proxy-Authorization: Bearer ${TOKEN}\r\nProxy-Connection: keep-alive\r\nConnection: close\r\n\r\n`,
    );
    expect(out).toContain('200 OK');
    expect(out.toLowerCase()).toContain('x-echo: yes');
    expect(out).toContain('hello /abs?x=1');
    expect(target.seen).toHaveLength(1);
    expect(target.seen[0]['proxy-authorization']).toBeUndefined();
    expect(target.seen[0]['proxy-connection']).toBeUndefined();
  });

  it('requires auth for absolute-URI and rejects https:// absolute URIs', async () => {
    const proxy = await startProxy();
    const noAuth = await rawRequest(
      proxy,
      `GET http://127.0.0.1:${target.port}/ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`,
    );
    expect(noAuth).toContain('407');
    const https = await rawRequest(
      proxy,
      `GET https://example.com/ HTTP/1.1\r\nHost: x\r\nProxy-Authorization: Bearer ${TOKEN}\r\nConnection: close\r\n\r\n`,
    );
    expect(https).toContain('400');
    const blocked = await startProxy({ allowedPorts: [443] });
    const out = await rawRequest(
      blocked,
      `GET http://127.0.0.1:${target.port}/ HTTP/1.1\r\nHost: x\r\nProxy-Authorization: Bearer ${TOKEN}\r\nConnection: close\r\n\r\n`,
    );
    expect(out).toContain('403');
  });

  it('serves /health without auth and 404 for other origin-form paths', async () => {
    const proxy = await startProxy();
    const health = await fetch(`http://127.0.0.1:${proxy}/health`);
    expect(health.status).toBe(200);
    expect(await health.text()).toBe('ok');
    expect((await fetch(`http://127.0.0.1:${proxy}/other`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${proxy}/__stats`)).status).toBe(404);
  });

  it('counts connections in /__stats and requires auth', async () => {
    const proxy = await startProxy({ exposeStats: true });
    expect((await getStats(proxy, '')).status).toBe(407);
    await connectAndGet(proxy, `Bearer ${TOKEN}`, target.port);
    await connectAndGet(proxy, `Bearer ${TOKEN}`, target.port);
    await connectAndGet(proxy, 'Bearer wrong', target.port);
    const stats = await getStats(proxy, `Bearer ${TOKEN}`);
    expect(stats.status).toBe(200);
    expect(await stats.json()).toEqual({ connections: { [`127.0.0.1:${target.port}`]: 2 } });
  });

  it('works end to end with undici ProxyAgent', async () => {
    const proxy = await startProxy({ exposeStats: true });
    const agent = new ProxyAgent({ uri: `http://127.0.0.1:${proxy}`, token: `Bearer ${TOKEN}` });
    const res = await undiciFetch(`http://127.0.0.1:${target.port}/via-undici`, { dispatcher: agent });
    expect(await res.text()).toBe('hello /via-undici');
    await agent.close();
    const stats = await getStats(proxy, `Bearer ${TOKEN}`);
    expect(await stats.json()).toEqual({ connections: { [`127.0.0.1:${target.port}`]: 1 } });
  });
});

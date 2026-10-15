import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { installEgressDispatcher, createEgressDispatcher } from './egress-dispatcher.js';
import { openConnectTunnel, installEgressAgents } from './tunnel-agents.js';
import { TEST_TLS_CERT, TEST_TLS_KEY } from './test-tls-fixture.js';
import { runWithEgressVendor } from './vendor-context.js';
import type { IEgressProxyConfig } from './types.js';

const closers: Array<() => void> = [];
afterAll(() => closers.forEach((close) => close()));
const listen = async <T extends net.Server>(server: T): Promise<number> => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => server.close());
  return (server.address() as AddressInfo).port;
};

/** A raw TCP "proxy" that answers every connection with whatever `reply` produces (or stays silent). */
const rawProxy = async (onConnection: (socket: net.Socket, request: string) => void): Promise<number> =>
  listen(
    net.createServer((socket) => {
      let seen = '';
      socket.on('error', () => {});
      socket.on('data', (chunk) => {
        seen += chunk.toString('latin1');
        if (seen.includes('\r\n\r\n')) {
          socket.removeAllListeners('data');
          onConnection(socket, seen);
        }
      });
    }),
  );

const tunnel = (config: IEgressProxyConfig, host = 'target.test', port = 8080) =>
  new Promise<{ error: Error | null; socket?: net.Socket }>((resolve) =>
    openConnectTunnel(config, host, port, (error, socket) => resolve({ error, socket })),
  );
const cfg = (port: number, token = 'tok'): IEgressProxyConfig => ({
  url: `http://127.0.0.1:${port}`,
  token,
  vendors: [],
});

describe('openConnectTunnel', () => {
  it('sends an authority CONNECT with the Bearer token and hands back bytes that arrived right after the head', async () => {
    let request = '';
    const port = await rawProxy((socket, seen) => {
      request = seen;
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\nEXTRA');
    });
    const { error, socket } = await tunnel(cfg(port, 'abc'), '::1', 443);
    expect(error).toBeNull();
    expect(request).toContain('CONNECT [::1]:443 HTTP/1.1\r\n');
    expect(request).toContain('Proxy-Authorization: Bearer abc\r\n');
    const data = await new Promise<string>((resolve) => socket?.once('data', (c) => resolve(c.toString())));
    expect(data).toBe('EXTRA');
    socket?.destroy();
  });

  it('delivers bytes that arrived with the proxy reply exactly once (no re-feeding of the unshifted tail)', async () => {
    const port = await rawProxy((socket) => socket.write('HTTP/1.1 200 OK\r\n\r\nEXTRA'));
    const { error, socket } = await tunnel(cfg(port));
    expect(error).toBeNull();
    const chunks: string[] = [];
    socket?.on('data', (c) => chunks.push(c.toString()));
    await new Promise((r) => setTimeout(r, 100));
    expect(chunks.join('')).toBe('EXTRA');
    socket?.destroy();
  });

  it('passes on a tail that arrives in a later packet than the head', async () => {
    const port = await rawProxy((socket) => {
      socket.write('HTTP/1.1 200 OK\r\n\r\n');
      setTimeout(() => socket.write('LATER'), 30);
    });
    const { error, socket } = await tunnel(cfg(port));
    expect(error).toBeNull();
    const data = await new Promise<string>((resolve) => socket?.once('data', (c) => resolve(c.toString())));
    expect(data).toBe('LATER');
    socket?.destroy();
  });

  it('rejects a non-200 status naming the target and status line', async () => {
    const port = await rawProxy((socket) => socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'));
    const { error } = await tunnel(cfg(port), 'h', 1);
    expect(error?.message).toMatch(/refused CONNECT h:1: HTTP\/1\.1 403 Forbidden/);
  });

  it('rejects an HTTP/2-style or garbage status line', async () => {
    const port = await rawProxy((socket) => socket.end('garbage\r\n\r\n'));
    expect((await tunnel(cfg(port))).error?.message).toMatch(/refused CONNECT/);
  });

  it('rejects when the proxy closes the connection mid-handshake', async () => {
    const port = await rawProxy((socket) => socket.destroy());
    expect((await tunnel(cfg(port))).error?.message).toMatch(/closed the connection during CONNECT/);
  });

  it('rejects an oversized response head', async () => {
    const port = await rawProxy((socket) => socket.write('X'.repeat(20 * 1024)));
    expect((await tunnel(cfg(port))).error?.message).toMatch(/head too large/);
  });

  it('rejects when the proxy is unreachable', async () => {
    const closed = await listen(net.createServer());
    closers.pop()?.();
    await new Promise((r) => setTimeout(r, 20));
    expect((await tunnel(cfg(closed))).error).toBeInstanceOf(Error);
  });

  it('can reach the proxy over TLS (https proxy URL)', async () => {
    let request = '';
    const server = tls.createServer({ cert: TEST_TLS_CERT, key: TEST_TLS_KEY }, (socket) => {
      socket.on('error', () => {});
      socket.on('data', (chunk) => {
        request += chunk.toString();
        socket.write('HTTP/1.1 200 OK\r\n\r\n');
      });
    });
    const port = await listen(server);
    // The fixture cert is self-signed; allow it for this one test.
    const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
      const { error, socket } = await tunnel({ url: `https://127.0.0.1:${port}`, token: 't', vendors: [] }, 'x', 9);
      expect(error).toBeNull();
      expect(request).toContain('CONNECT x:9');
      socket?.destroy();
    } finally {
      if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
    }
  });
});

describe('agents and dispatcher lifecycle', () => {
  const disposers: Array<{ dispose(): void }> = [];
  afterEach(() => {
    while (disposers.length) disposers.pop()?.dispose();
  });

  it('dispose restores the previous global agents', () => {
    const before = { http: http.globalAgent, https: https.globalAgent };
    const handle = installEgressAgents({ getConfig: () => null });
    expect(http.globalAgent).not.toBe(before.http);
    expect(https.globalAgent).not.toBe(before.https);
    handle.dispose();
    expect(http.globalAgent).toBe(before.http);
    expect(https.globalAgent).toBe(before.https);
  });

  it('routes an IPv6 literal target through the proxy with a bracketed authority', async () => {
    let request = '';
    const proxyPort = await rawProxy((socket, seen) => {
      request = seen;
      socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    });
    disposers.push(
      installEgressAgents({ getConfig: () => ({ url: `http://127.0.0.1:${proxyPort}`, token: 't', vendors: ['v'] }) }),
    );
    await expect(
      runWithEgressVendor(
        'v',
        () => new Promise((resolve, reject) => http.get('http://[::1]:9/', resolve).on('error', reject)),
      ),
    ).rejects.toThrow(/refused CONNECT/);
    expect(request).toContain('CONNECT [::1]:9 HTTP/1.1');
  });

  it('the dispatcher swaps its proxy agent when the proxy token changes, and keeps going direct for an unparsable origin', async () => {
    const seenAuth: string[] = [];
    const proxyServer = http.createServer();
    proxyServer.on('connect', (req, socket) => {
      seenAuth.push(String(req.headers['proxy-authorization']));
      socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    });
    const proxyPort = await listen(proxyServer);
    let token = 'one';
    const options = { getConfig: () => ({ url: `http://127.0.0.1:${proxyPort}`, token, vendors: ['v'] }) };
    disposers.push(installEgressDispatcher(options));
    const call = () => runWithEgressVendor('v', () => fetch('http://127.0.0.1:8099/').catch(() => 'failed'));
    await call();
    token = 'two';
    await call();
    expect(seenAuth).toEqual(['Bearer one', 'Bearer two']);
  });

  it('dispatcher close()/destroy() resolve with and without a live proxy agent', async () => {
    const dispatcher = createEgressDispatcher({ getConfig: () => null });
    await expect(dispatcher.close()).resolves.toBeUndefined();
    const another = createEgressDispatcher({ getConfig: () => null });
    await expect(another.destroy()).resolves.toBeUndefined();
  });
});

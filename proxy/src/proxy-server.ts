import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import { isAuthorized } from './auth.js';

export interface IProxyServerOptions {
  /** Accepted tokens (at least one). */
  tokens: readonly string[];
  /** Allowed target ports; `'*'` = any. Default `[443, 80]`. */
  allowedPorts?: readonly number[] | '*';
  /** Enables `GET /__stats`. */
  exposeStats?: boolean;
  /** Access log sink; defaults to stdout. */
  log?: (line: string) => void;
}

const HOP_BY_HOP = [
  'proxy-authorization',
  'proxy-authenticate',
  'proxy-connection',
  'connection',
  'keep-alive',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

const stripHopByHop = (headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders => {
  const drop = new Set(HOP_BY_HOP);
  const connection = headers.connection;
  if (connection) {
    for (const name of connection.split(',')) {
      drop.add(name.trim().toLowerCase());
    }
  }
  const result: http.OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!drop.has(name.toLowerCase())) {
      result[name] = value;
    }
  }
  return result;
};

const RAW_407 =
  'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="falang-proxy"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n';

export const createProxyServer = (options: IProxyServerOptions): http.Server => {
  const tokens = options.tokens;
  const allowedPorts = options.allowedPorts ?? [443, 80];
  const log = options.log ?? ((line: string) => console.log(line));
  const stats = new Map<string, number>();

  const portAllowed = (port: number): boolean => allowedPorts === '*' || allowedPorts.includes(port);
  const count = (target: string): void => {
    stats.set(target, (stats.get(target) ?? 0) + 1);
  };

  const reply = (res: http.ServerResponse, status: number, body: string, headers: http.OutgoingHttpHeaders = {}) => {
    res.writeHead(status, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      ...headers,
    });
    res.end(body);
  };

  const server = http.createServer((req, res) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    // Origin-form: the proxy's own endpoints.
    if (url.startsWith('/')) {
      if (method === 'GET' && url === '/health') {
        log(`${method} ${url} 200`);
        reply(res, 200, 'ok');
        return;
      }
      if (method === 'GET' && url === '/__stats' && options.exposeStats) {
        if (!isAuthorized(req.headers['proxy-authorization'], tokens)) {
          log(`${method} ${url} 407`);
          reply(res, 407, 'Proxy Authentication Required', { 'Proxy-Authenticate': 'Basic realm="falang-proxy"' });
          return;
        }
        log(`${method} ${url} 200`);
        reply(res, 200, JSON.stringify({ connections: Object.fromEntries(stats) }), {
          'Content-Type': 'application/json',
        });
        return;
      }
      log(`${method} ${url} 404`);
      reply(res, 404, 'Not Found');
      return;
    }

    let target: URL;
    try {
      target = new URL(url);
    } catch {
      log(`${method} ${url} 400`);
      reply(res, 400, 'Bad Request');
      return;
    }
    if (!isAuthorized(req.headers['proxy-authorization'], tokens)) {
      log(`${method} ${target.host} 407`);
      reply(res, 407, 'Proxy Authentication Required', { 'Proxy-Authenticate': 'Basic realm="falang-proxy"' });
      return;
    }
    if (target.protocol !== 'http:') {
      log(`${method} ${target.host} 400`);
      reply(res, 400, 'Only http:// absolute URIs are forwarded; use CONNECT for https');
      return;
    }
    const port = target.port ? Number(target.port) : 80;
    if (!portAllowed(port)) {
      log(`${method} ${target.hostname}:${port} 403`);
      reply(res, 403, 'Port not allowed');
      return;
    }
    const label = `${target.hostname}:${port}`;
    count(label);

    const upstream = http.request(
      {
        host: target.hostname,
        port,
        method,
        path: `${target.pathname}${target.search}`,
        headers: stripHopByHop(req.headers),
      },
      (upstreamRes) => {
        log(`${method} ${label} ${upstreamRes.statusCode ?? 502}`);
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.statusMessage, stripHopByHop(upstreamRes.headers));
        upstreamRes.pipe(res);
      },
    );
    upstream.on('error', () => {
      log(`${method} ${label} 502`);
      if (!res.headersSent) {
        reply(res, 502, 'Bad Gateway');
      } else {
        res.destroy();
      }
    });
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });

  server.on('connect', (req: http.IncomingMessage, clientSocket: Duplex, head: Buffer) => {
    clientSocket.on('error', () => clientSocket.destroy());
    const authority = req.url ?? '';
    if (!isAuthorized(req.headers['proxy-authorization'], tokens)) {
      log(`CONNECT ${authority} 407`);
      clientSocket.end(RAW_407);
      return;
    }
    const separator = authority.lastIndexOf(':');
    const host = separator === -1 ? authority : authority.slice(0, separator).replace(/^\[|\]$/g, '');
    const port = separator === -1 ? NaN : Number(authority.slice(separator + 1));
    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
      log(`CONNECT ${authority} 400`);
      clientSocket.end('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      return;
    }
    if (!portAllowed(port)) {
      log(`CONNECT ${authority} 403`);
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      return;
    }
    count(`${host}:${port}`);
    const upstream = net.connect(port, host);
    let established = false;
    upstream.once('connect', () => {
      established = true;
      log(`CONNECT ${authority} 200`);
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) {
        upstream.write(head);
      }
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => {
      if (!established) {
        log(`CONNECT ${authority} 502`);
        clientSocket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      }
      clientSocket.destroy();
      upstream.destroy();
    });
    upstream.on('close', () => clientSocket.destroy());
    clientSocket.on('close', () => upstream.destroy());
  });

  return server;
};

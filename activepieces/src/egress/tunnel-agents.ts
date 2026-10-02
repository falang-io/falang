import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import type { Duplex } from 'node:stream';
import { pickEgressProxy } from './routing.js';
import type { IEgressProxyConfig, IEgressRoutingOptions } from './types.js';

const CONNECT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_HEAD = 16 * 1024;

type TConnectionOptions = http.ClientRequestArgs & { servername?: string; [key: string]: unknown };
type TConnectionCallback = (error: Error | null, stream: Duplex) => void;

const stripBrackets = (host: string): string => (host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host);

const targetOf = (
  options: TConnectionOptions,
  protocol: 'http:' | 'https:',
): { host: string; port: number; url: URL } => {
  const host = stripBrackets(String(options.host ?? options.hostname ?? 'localhost'));
  const port = Number(options.port) || (protocol === 'https:' ? 443 : 80);
  const printable = host.includes(':') ? `[${host}]` : host;
  return { host, port, url: new URL(`${protocol}//${printable}:${port}`) };
};

/**
 * Opens a `CONNECT host:port` tunnel through the egress proxy (`Proxy-Authorization: Bearer <token>`); the proxy URL
 * may be `http:` or `https:`. Calls back with the raw tunnelled socket, ready for the application protocol.
 */
export const openConnectTunnel = (
  config: IEgressProxyConfig,
  host: string,
  port: number,
  callback: (error: Error | null, socket?: net.Socket) => void,
): void => {
  const proxyUrl = new URL(config.url);
  const secure = proxyUrl.protocol === 'https:';
  const proxyHost = stripBrackets(proxyUrl.hostname);
  const proxyPort = Number(proxyUrl.port) || (secure ? 443 : 80);
  const socket: net.Socket = secure
    ? tls.connect({ host: proxyHost, port: proxyPort, servername: net.isIP(proxyHost) ? undefined : proxyHost })
    : net.connect({ host: proxyHost, port: proxyPort });

  let settled = false;
  const finish = (error: Error | null): void => {
    if (settled) return;
    settled = true;
    socket.setTimeout(0);
    socket.removeListener('data', onData);
    socket.removeListener('error', onError);
    socket.removeListener('close', onClose);
    socket.removeListener('timeout', onTimeout);
    if (error) {
      socket.destroy();
      callback(error);
    } else {
      callback(null, socket);
    }
  };
  let buffered = Buffer.alloc(0);
  function onData(chunk: Buffer): void {
    buffered = Buffer.concat([buffered, chunk]);
    const end = buffered.indexOf('\r\n\r\n');
    if (end === -1) {
      if (buffered.length > MAX_RESPONSE_HEAD) finish(new Error('egress proxy: CONNECT response head too large'));
      return;
    }
    const statusLine = buffered.subarray(0, buffered.indexOf('\r\n')).toString('latin1');
    const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(statusLine)?.[1]);
    if (status !== 200) {
      finish(new Error(`egress proxy refused CONNECT ${host}:${port}: ${statusLine}`));
      return;
    }
    const rest = buffered.subarray(end + 4);
    if (rest.length > 0) socket.unshift(rest);
    finish(null);
  }
  function onError(error: Error): void {
    finish(error);
  }
  function onClose(): void {
    finish(new Error('egress proxy closed the connection during CONNECT'));
  }
  function onTimeout(): void {
    finish(new Error('egress proxy: CONNECT timed out'));
  }

  socket.setTimeout(CONNECT_TIMEOUT_MS);
  socket.on('data', onData);
  socket.on('error', onError);
  socket.on('close', onClose);
  socket.on('timeout', onTimeout);
  const authority = `${host.includes(':') ? `[${host}]` : host}:${port}`;
  const send = (): void => {
    socket.write(
      `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\nProxy-Authorization: Bearer ${config.token}\r\nProxy-Connection: keep-alive\r\n\r\n`,
    );
  };
  if (secure) socket.once('secureConnect', send);
  else socket.once('connect', send);
};

// Node's own defaults for the global agents (see lib/_http_agent.js `globalAgent`).
const AGENT_DEFAULTS = { keepAlive: true, scheduling: 'lifo', timeout: 5000 } as const;

/**
 * Both agents add a marker to the pool key of proxied requests so a kept-alive tunnel is never reused by a direct
 * request to the same host (or by a request that needs a different proxy).
 */
const createAgents = (routing: IEgressRoutingOptions) => {
  const proxyFor = (options: TConnectionOptions, protocol: 'http:' | 'https:') =>
    pickEgressProxy(routing, targetOf(options, protocol).url);
  const marker = (config: IEgressProxyConfig | null): string => (config ? `:egress=${config.url}` : '');

  class RoutingHttpAgent extends http.Agent {
    override getName(options: TConnectionOptions): string {
      return super.getName(options) + marker(proxyFor(options, 'http:'));
    }
    override createConnection(options: TConnectionOptions, callback?: TConnectionCallback): Duplex | null | undefined {
      const config = proxyFor(options, 'http:');
      if (!config || !callback) return super.createConnection(options, callback as TConnectionCallback);
      const { host, port } = targetOf(options, 'http:');
      openConnectTunnel(config, host, port, (error, socket) => {
        if (error || !socket) callback(error ?? new Error('egress tunnel failed'), undefined as unknown as Duplex);
        else callback(null, socket);
      });
      return undefined; // the socket arrives through the callback (Node's Agent supports the async form)
    }
  }

  class RoutingHttpsAgent extends https.Agent {
    override getName(options: TConnectionOptions): string {
      return super.getName(options) + marker(proxyFor(options, 'https:'));
    }
    override createConnection(options: TConnectionOptions, callback?: TConnectionCallback): Duplex | null | undefined {
      const config = proxyFor(options, 'https:');
      if (!config || !callback) {
        return (super.createConnection as (o: unknown, cb?: unknown) => Duplex)(options, callback);
      }
      const { host, port } = targetOf(options, 'https:');
      openConnectTunnel(config, host, port, (error, tunnel) => {
        if (error || !tunnel) {
          callback(error ?? new Error('egress tunnel failed'), undefined as unknown as Duplex);
          return;
        }
        const { agent: _agent, _agentKey: _key, path: _path, ...tlsOptions } = options as Record<string, unknown>;
        const servername =
          typeof options.servername === 'string' && options.servername
            ? options.servername
            : net.isIP(host)
              ? undefined
              : host;
        const secure = tls.connect({ ...tlsOptions, socket: tunnel, servername } as tls.ConnectionOptions);
        callback(null, secure);
      });
      return undefined;
    }
  }

  return {
    http: new RoutingHttpAgent(AGENT_DEFAULTS),
    https: new RoutingHttpsAgent(AGENT_DEFAULTS),
  };
};

/**
 * Replaces `http.globalAgent`/`https.globalAgent` (what axios and every `http.request` without an explicit agent
 * use) with agents that tunnel via `CONNECT` when the routing decision says "proxy". Requests carrying their own
 * `agent` are not affected.
 */
export const installEgressAgents = (routing: IEgressRoutingOptions): { dispose(): void } => {
  const previousHttp = http.globalAgent;
  const previousHttps = https.globalAgent;
  const agents = createAgents(routing);
  http.globalAgent = agents.http;
  https.globalAgent = agents.https;
  return {
    dispose: () => {
      http.globalAgent = previousHttp;
      https.globalAgent = previousHttps;
      agents.http.destroy();
      agents.https.destroy();
    },
  };
};

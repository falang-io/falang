import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import net from 'node:net';

/**
 * Extra dynamic config for the dev server (`KEY=JSON`). Empty on purpose: verified live on `temporal` CLI 1.7.1 /
 * Temporal server 1.31.0 that Worker Deployment versioning (a versioned Worker + the raw
 * `setWorkerDeploymentCurrentVersion` RPC) works with NO extra flags; the RPC answers NOT_FOUND until the
 * Worker's first poll registers the deployment, which the backend already retries.
 */
export const DEFAULT_DEV_SERVER_DYNAMIC_CONFIG: Readonly<Record<string, string>> = {};

export interface ITemporalDevServerChild {
  readonly stdout: NodeJS.ReadableStream | null;
  readonly stderr: NodeJS.ReadableStream | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  readonly exitCode: number | null;
}

export type TTemporalSpawn = (command: string, args: string[]) => ITemporalDevServerChild;

export interface IStartTemporalDevServerParams {
  readonly cliPath: string;
  readonly dbFile: string;
  readonly port?: number;
  readonly uiPort?: number;
  readonly headless?: boolean;
  readonly ip?: string;
  readonly namespace?: string;
  readonly dynamicConfig?: Readonly<Record<string, string>>;
  readonly log?: (line: string) => void;
  readonly spawn?: TTemporalSpawn;
  /** Test seam: resolves true when the address accepts a connection. */
  readonly probe?: (host: string, port: number) => Promise<boolean>;
  readonly startTimeoutMs?: number;
  readonly stopTimeoutMs?: number;
}

export interface ITemporalDevServer {
  /** `host:port` for `TEMPORAL_ADDRESS`. */
  readonly address: string;
  readonly uiUrl: string | null;
  /** Resolves when the child has exited (also after `stop()`). */
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  stop(): Promise<void>;
}

const STDERR_TAIL_LINES = 40;

export const findFreePort = (host = '127.0.0.1'): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => {
        resolve(port);
      });
    });
  });

const tcpProbe = (host: string, port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const buildDevServerArgs = (p: {
  dbFile: string;
  ip: string;
  port: number;
  uiPort: number | null;
  namespace: string;
  dynamicConfig: Readonly<Record<string, string>>;
}): string[] => {
  const args = [
    'server',
    'start-dev',
    '--db-filename',
    p.dbFile,
    '--ip',
    p.ip,
    '--port',
    String(p.port),
    ...(p.uiPort === null ? ['--headless'] : ['--ui-port', String(p.uiPort)]),
    '--namespace',
    p.namespace,
    '--log-level',
    'warn',
  ];
  for (const [key, value] of Object.entries(p.dynamicConfig)) args.push('--dynamic-config-value', `${key}=${value}`);
  return args;
};

const pipeLines = (stream: NodeJS.ReadableStream | null, onLine: (line: string) => void): void => {
  if (!stream) return;
  let buffer = '';
  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) if (line) onLine(line);
  });
  stream.on('end', () => {
    if (buffer) onLine(buffer);
  });
};

/** Starts `temporal server start-dev` (file-backed) and waits until its gRPC port accepts connections. */
export const startTemporalDevServer = async (params: IStartTemporalDevServerParams): Promise<ITemporalDevServer> => {
  const ip = params.ip ?? '127.0.0.1';
  const port = params.port ?? (await findFreePort(ip));
  const headless = params.headless ?? false;
  const uiPort = headless ? null : (params.uiPort ?? (await findFreePort(ip)));
  const log = params.log ?? (() => null);
  const probe = params.probe ?? tcpProbe;
  const spawnFn: TTemporalSpawn =
    params.spawn ??
    ((command, args) => nodeSpawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] }) as ChildProcess);
  const args = buildDevServerArgs({
    dbFile: params.dbFile,
    ip,
    port,
    uiPort,
    namespace: params.namespace ?? 'default',
    dynamicConfig: { ...DEFAULT_DEV_SERVER_DYNAMIC_CONFIG, ...params.dynamicConfig },
  });
  const child = spawnFn(params.cliPath, args);
  const tail: string[] = [];
  const onLine = (line: string): void => {
    tail.push(line);
    if (tail.length > STDERR_TAIL_LINES) tail.shift();
    log(`[temporal] ${line}`);
  };
  pipeLines(child.stdout, onLine);
  pipeLines(child.stderr, onLine);

  let exitedFlag = false;
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once('exit', (code, signal) => {
      exitedFlag = true;
      resolve({ code, signal });
    });
  });

  const timeoutMs = params.startTimeoutMs ?? 60_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (exitedFlag) {
      // oxlint-disable-next-line no-await-in-loop -- terminal branch, leaves the loop by throwing
      const { code } = await exited;
      throw new Error(`Temporal dev server exited (code ${code}) before it was ready:\n${tail.join('\n')}`);
    }
    // oxlint-disable-next-line no-await-in-loop -- polling
    if (await probe(ip, port)) break;
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`Temporal dev server did not open ${ip}:${port} within ${timeoutMs} ms:\n${tail.join('\n')}`);
    }
    // oxlint-disable-next-line no-await-in-loop -- polling
    await sleep(100);
  }

  let stopping: Promise<void> | null = null;
  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      if (exitedFlag) return;
      const isWin = process.platform === 'win32';
      if (isWin) child.kill();
      else child.kill('SIGTERM');
      const timedOut = await Promise.race([
        exited.then(() => false),
        sleep(params.stopTimeoutMs ?? 10_000).then(() => true),
      ]);
      if (timedOut) {
        child.kill('SIGKILL');
        await exited;
      }
    })();
    return stopping;
  };

  return { address: `${ip}:${port}`, uiUrl: uiPort === null ? null : `http://${ip}:${uiPort}`, exited, stop };
};

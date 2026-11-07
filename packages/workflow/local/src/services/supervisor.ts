// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __filename is the correct tool here.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

const requireFromHere = createRequire(__filename);

export type TReadyCheck =
  /** Ready once `url` answers with a status `accept` allows (default: any status below 500). */
  | { readonly url: string; readonly accept?: (status: number) => boolean }
  /** Ready once `host:port` accepts a TCP connection. */
  | { readonly host?: string; readonly port: number };

export interface IStartSupervisedProcessParams {
  /** Short name for log prefixes (`[name] <line>`) and error messages. */
  readonly name: string;
  readonly command: string;
  readonly args?: readonly string[];
  /** Full environment of the child; default `process.env`. Services pass `{ ...ctx.childEnv, … }`. */
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  /** Receives every output line (stdout and stderr) as `[name] <line>`. */
  readonly log: (line: string) => void;
  /** Resolve only once this answers; without it `startSupervisedProcess` resolves right after spawning. */
  readonly ready?: TReadyCheck;
  /** Default 60 000 ms; the child is killed when it is not ready by then. */
  readonly readyTimeoutMs?: number;
  /** Grace period between SIGTERM and SIGKILL in `stop()`. Default 10 000 ms. */
  readonly stopTimeoutMs?: number;
  /** Called when the child exits on its own after it became ready (not after `stop()`). */
  readonly onUnexpectedExit?: (error: Error) => void;
  /** How many output lines error messages quote. Default 40. */
  readonly tailLines?: number;
}

export interface IProcessExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface ISupervisedProcess {
  readonly pid: number | undefined;
  /** Resolves when the child has exited (also after `stop()`). */
  readonly exited: Promise<IProcessExit>;
  /** The last output lines (unprefixed). */
  outputTail(): string[];
  /** SIGTERM, then SIGKILL after `stopTimeoutMs`; resolves once the child is gone. Idempotent. */
  stop(): Promise<void>;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
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

const httpProbe = async (url: string, accept: (status: number) => boolean): Promise<boolean> => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    await response.body?.cancel();
    return accept(response.status);
  } catch {
    return false;
  }
};

/** Resolves true once `check` answers, false after `timeoutMs` or as soon as `stopWaiting()` returns true. */
export const waitUntilReady = async (
  check: TReadyCheck,
  timeoutMs: number,
  stopWaiting: () => boolean = () => false,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  const probe =
    'url' in check
      ? () => httpProbe(check.url, check.accept ?? ((status) => status < 500))
      : () => tcpProbe(check.host ?? '127.0.0.1', check.port);
  for (;;) {
    if (stopWaiting()) return false;
    // oxlint-disable-next-line no-await-in-loop -- polling
    if (await probe()) return true;
    if (Date.now() > deadline) return false;
    // oxlint-disable-next-line no-await-in-loop -- polling
    await sleep(150);
  }
};

const describeReady = (check: TReadyCheck): string =>
  'url' in check ? check.url : `${check.host ?? '127.0.0.1'}:${check.port}`;

/**
 * Spawns a long-running child process, pipes its output to `log`, waits until `ready` answers and returns a handle
 * that stops it. If the child exits before it is ready, or is not ready in time, it throws an error quoting the tail
 * of the output (and kills the child in the timeout case).
 */
export const startSupervisedProcess = async (params: IStartSupervisedProcessParams): Promise<ISupervisedProcess> => {
  const tailLimit = params.tailLines ?? 40;
  const tail: string[] = [];
  const child = spawn(params.command, [...(params.args ?? [])], {
    cwd: params.cwd,
    env: params.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const onLine = (line: string): void => {
    tail.push(line);
    if (tail.length > tailLimit) tail.shift();
    params.log(`[${params.name}] ${line}`);
  };
  for (const stream of [child.stdout, child.stderr]) {
    let buffer = '';
    stream.on('data', (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) if (line) onLine(line);
    });
    stream.on('end', () => {
      if (buffer) onLine(buffer);
      buffer = '';
    });
  }

  let exitedFlag = false;
  let spawnError: Error | null = null;
  let stopRequested = false;
  let ready = false;
  const exited = new Promise<IProcessExit>((resolve) => {
    child.once('error', (error) => {
      spawnError = error;
      exitedFlag = true;
      resolve({ code: null, signal: null });
    });
    child.once('exit', (code, signal) => {
      exitedFlag = true;
      resolve({ code, signal });
    });
  });
  const outputTail = (): string[] => [...tail];
  const failure = (message: string): Error =>
    new Error(`${message}${tail.length > 0 ? `; last output:\n${tail.join('\n')}` : ' (no output)'}`);

  const stopTimeoutMs = params.stopTimeoutMs ?? 10_000;
  let stopping: Promise<void> | null = null;
  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      stopRequested = true;
      if (exitedFlag) return;
      child.kill('SIGTERM');
      const timedOut = await Promise.race([exited.then(() => false), sleep(stopTimeoutMs).then(() => true)]);
      if (timedOut) {
        child.kill('SIGKILL');
        await exited;
      }
    })();
    return stopping;
  };

  exited
    .then(({ code, signal }) => {
      if (ready && !stopRequested) {
        params.onUnexpectedExit?.(failure(`${params.name} exited unexpectedly (code ${code}, signal ${signal})`));
      }
    })
    .catch(() => null);

  if (params.ready) {
    const timeoutMs = params.readyTimeoutMs ?? 60_000;
    const ok = await waitUntilReady(params.ready, timeoutMs, () => exitedFlag);
    if (!ok) {
      if (exitedFlag) {
        const { code, signal } = await exited;
        // Let the output streams drain so the tail is complete.
        await sleep(50);
        if (spawnError) throw failure(`${params.name} could not be started: ${(spawnError as Error).message}`);
        throw failure(`${params.name} exited (code ${code}, signal ${signal}) before it was ready`);
      }
      await stop();
      throw failure(`${params.name} did not answer on ${describeReady(params.ready)} within ${timeoutMs} ms`);
    }
  } else if (typeof child.pid !== 'number') {
    await exited;
    throw failure(`${params.name} could not be started: ${spawnError ? (spawnError as Error).message : 'no pid'}`);
  }
  ready = true;
  return { pid: child.pid, exited, outputTail, stop };
};

/** `--import` value for `tsx` (a file URL: `--import` takes a URL or a bare specifier, not a Windows path). */
export const tsxLoaderUrl = (): string => pathToFileURL(requireFromHere.resolve('tsx')).href;

/**
 * The command that runs a TypeScript entry point as one Node process: `process.execPath --import <tsx> <entry>`
 * (the `tsx` CLI would add a second process and not forward signals). Spread it into `startSupervisedProcess`.
 */
export const tsxEntryCommand = (
  entry: string,
  args: readonly string[] = [],
): { readonly command: string; readonly args: readonly string[] } => ({
  command: process.execPath,
  args: ['--import', tsxLoaderUrl(), entry, ...args],
});

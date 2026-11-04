import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { resolveArduinoCli } from './resolve-arduino-cli.js';

export type TArduinoCliStream = 'stdout' | 'stderr';

export interface ISpawnArduinoCliOptions {
  /** Called once per output line (without its line ending), in arrival order. */
  readonly onOutput?: (line: string, stream: TArduinoCliStream) => void;
  /** Aborting kills the process; the result then has `cancelled: true`. */
  readonly signal?: AbortSignal;
  /** Extra environment layered over `process.env` (e.g. `ARDUINO_DIRECTORIES_DATA`). */
  readonly env?: Readonly<Record<string, string>>;
}

export interface ISpawnArduinoCliResult {
  readonly ok: boolean;
  readonly exitCode: number | null;
  readonly cancelled: boolean;
  /** stdout and stderr interleaved as they arrived. */
  readonly output: string;
  readonly stdout: string;
  /** Set when the process could not be started at all. */
  readonly spawnError?: string;
}

type TSpawned = { readonly child: ChildProcessByStdio<null, Readable, Readable> } | { readonly error: string };

const trySpawn = (command: string, args: readonly string[], env: ISpawnArduinoCliOptions['env']): TSpawned => {
  try {
    return { child: spawn(command, [...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

/**
 * Runs one long `arduino-cli` command with streamed output and cancellation — no fixed timeout (a core
 * download is hundreds of MB). Never rejects: a failure to start is `{ ok: false, spawnError }`.
 */
export const spawnArduinoCli = async (
  args: readonly string[],
  options: ISpawnArduinoCliOptions = {},
): Promise<ISpawnArduinoCliResult> => {
  const command = await resolveArduinoCli();
  return new Promise((resolve) => {
    const signal = options.signal;
    if (signal?.aborted) {
      resolve({ ok: false, exitCode: null, cancelled: true, output: '', stdout: '' });
      return;
    }
    const started = trySpawn(command, args, options.env);
    if ('error' in started) {
      resolve({ ok: false, exitCode: null, cancelled: false, output: '', stdout: '', spawnError: started.error });
      return;
    }
    const { child } = started;
    let output = '';
    let stdout = '';
    let cancelled = false;
    let settled = false;
    const pending: Record<TArduinoCliStream, string> = { stdout: '', stderr: '' };

    const emitLines = (stream: TArduinoCliStream, chunk: string, flush: boolean): void => {
      pending[stream] += chunk;
      const lines = pending[stream].split(/\r\n|\n|\r/);
      pending[stream] = flush ? '' : (lines.pop() ?? '');
      if (flush && lines.at(-1) === '') lines.pop();
      for (const line of lines) options.onOutput?.(line, stream);
    };
    const onAbort = (): void => {
      cancelled = true;
      child.kill();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const finish = (result: Omit<ISpawnArduinoCliResult, 'output' | 'stdout' | 'cancelled'>): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      emitLines('stdout', '', true);
      emitLines('stderr', '', true);
      resolve({ ...result, cancelled, output, stdout });
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
      stdout += chunk;
      emitLines('stdout', chunk, false);
    });
    child.stderr.on('data', (chunk: string) => {
      output += chunk;
      emitLines('stderr', chunk, false);
    });
    child.on('error', (error) => {
      finish({ ok: false, exitCode: null, spawnError: error.message });
    });
    child.on('close', (code) => {
      finish({ ok: code === 0 && !cancelled, exitCode: code });
    });
  });
};

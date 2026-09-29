import { PassThrough } from 'node:stream';
import type { IProcessSpawner, ISpawnedProcess } from './ffmpeg-process.js';

export interface IFakeSpawnCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly stdout: PassThrough;
  readonly stderr: PassThrough;
  finish(code: number | null, signal?: NodeJS.Signals | null): void;
}

/** A scriptable `IProcessSpawner` for unit tests — nothing here ever touches a real process.
 * `onSpawn` is invoked synchronously from `spawn()`, so a test can push data to `stdout`/`stderr`
 * and then call `finish()` once it's done, or hold onto the call and finish it later (e.g. to
 * simulate a timeout by never calling `finish` at all). */
export class FakeProcessSpawner implements IProcessSpawner {
  readonly calls: IFakeSpawnCall[] = [];
  killed: { readonly command: string; readonly signal: NodeJS.Signals | null }[] = [];

  private readonly onSpawn: ((call: IFakeSpawnCall) => void) | null;

  constructor(onSpawn: ((call: IFakeSpawnCall) => void) | null = null) {
    this.onSpawn = onSpawn;
  }

  spawn(command: string, args: readonly string[]): ISpawnedProcess {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const exitCallbacks: ((code: number | null, signal: NodeJS.Signals | null) => void)[] = [];
    const call: IFakeSpawnCall = {
      command,
      args,
      stdout,
      stderr,
      finish: (code, signal = null) => {
        stdout.end();
        stderr.end();
        for (const callback of exitCallbacks) callback(code, signal);
      },
    };
    this.calls.push(call);
    this.onSpawn?.(call);
    return {
      stdout,
      stderr,
      kill: (signal) => {
        this.killed.push({ command, signal: signal ?? null });
        call.finish(null, signal ?? 'SIGKILL');
      },
      onExit: (callback) => exitCallbacks.push(callback),
    };
  }
}

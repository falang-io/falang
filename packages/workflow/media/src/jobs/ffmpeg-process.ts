import { spawn } from 'node:child_process';

/** Thin process handle every caller in this package uses instead of Node's own `ChildProcess`, so
 * `real-ffmpeg.test.ts` and the argv/queue unit tests can share one interface — the fake spawner
 * used by unit tests never touches a real process. */
export interface ISpawnedProcess {
  readonly stdout: NodeJS.ReadableStream;
  readonly stderr: NodeJS.ReadableStream;
  kill(signal?: NodeJS.Signals): void;
  onExit(callback: (code: number | null, signal: NodeJS.Signals | null) => void): void;
}

export interface IProcessSpawner {
  spawn(command: string, args: readonly string[]): ISpawnedProcess;
}

export class NodeProcessSpawner implements IProcessSpawner {
  spawn(command: string, args: readonly string[]): ISpawnedProcess {
    const child = spawn(command, args as string[], { stdio: ['ignore', 'pipe', 'pipe'] });
    return {
      stdout: child.stdout,
      stderr: child.stderr,
      kill: (signal) => {
        child.kill(signal ?? 'SIGKILL');
      },
      onExit: (callback) => {
        let settled = false;
        child.on('exit', (code, signal) => {
          if (settled) return;
          settled = true;
          callback(code, signal);
        });
        child.on('error', () => {
          if (settled) return;
          settled = true;
          callback(null, null);
        });
      },
    };
  }
}

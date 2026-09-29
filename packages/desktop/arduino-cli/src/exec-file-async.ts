import { execFile } from 'node:child_process';

export interface IExecFileOutcome {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly errorMessage?: string;
}

/** Promise-wraps `child_process.execFile` with a plain, easily-mockable signature (no callback-overload typing to fight in tests) — `runArduinoCli` is the only caller. */
export const execFileAsync = (command: string, args: readonly string[]): Promise<IExecFileOutcome> =>
  new Promise((resolve) => {
    execFile(command, [...args], (error, stdout, stderr) => {
      if (!error) {
        resolve({ ok: true, stdout, stderr });
        return;
      }
      resolve({ ok: false, stdout, stderr, errorMessage: error.message });
    });
  });

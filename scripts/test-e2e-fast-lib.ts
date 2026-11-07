/** Process helpers of `scripts/test-e2e-fast.ts` (kept apart to keep that script readable). */
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import net from 'node:net';

export const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port')),
      );
    });
  });

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const isUp = async (url: string): Promise<boolean> => {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
};

/** Runs a command with inherited output; resolves with its exit code. */
export const run = (
  command: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<number> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });

/** Starts a long-running TypeScript entry point with its output in `logFile`. */
export const startService = (
  entry: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  logFile: string,
  cwd: string,
): ChildProcess => {
  const log = createWriteStream(logFile);
  // `--import tsx` keeps it one Node process, so a signal reaches the service itself (`npx tsx` would not forward it).
  const child = spawn(process.execPath, ['--import', 'tsx', entry, ...args], { cwd, env, stdio: 'pipe' });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  return child;
};

export const stopService = async (
  child: ChildProcess | null,
  signal: NodeJS.Signals,
  timeoutMs: number,
): Promise<void> => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
  });
  child.kill(signal);
  await Promise.race([exited, sleep(timeoutMs)]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
};

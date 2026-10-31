// oxlint-disable no-void, no-console -- fire-and-forget promises of Electron APIs are intentional here.
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { LogTail } from './log-tail.js';
import type { IBackendCommand } from './resolve-backend-command.js';
import { readStatusFile, type ILocalStatus } from './status-file.js';

const POLL_INTERVAL_MS = 300;
const READY_TIMEOUT_MS = 120_000;
const STOP_TIMEOUT_MS = 15_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export interface IBackendProcessParams {
  readonly command: IBackendCommand;
  readonly statusFile: string;
  /** Called when the child exits on its own after it became ready. */
  /** Every non-empty line of the child's output. */
  readonly onLine?: (line: string) => void;
  readonly onUnexpectedExit: (message: string) => void;
}

/** The local-mode backend as a child process (the same code path in dev and in a packaged app). */
export class BackendProcess {
  private readonly params: IBackendProcessParams;
  private child: ChildProcess | null = null;
  private exited: Promise<void> = Promise.resolve();
  private exitMessage: string | null = null;
  private status: ILocalStatus | null = null;
  private stopping = false;
  private readonly tail = new LogTail(200);

  constructor(params: IBackendProcessParams) {
    this.params = params;
  }

  get logTail(): string {
    return this.tail.text();
  }

  get currentStatus(): ILocalStatus | null {
    return this.status;
  }

  /** Spawns the child and resolves once its status file appears; rejects if it dies first or takes too long. */
  async start(): Promise<ILocalStatus> {
    await fs.rm(this.params.statusFile, { force: true });
    const { command, args, cwd, env } = this.params.command;
    const child = spawn(command, [...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    const forward = (chunk: Buffer): void => {
      const text = chunk.toString('utf8');
      this.tail.push(text);
      for (const line of text.split(/\r?\n/)) {
        if (line.length === 0) continue;
        console.log(`[backend] ${line}`);
        this.params.onLine?.(line);
      }
    };
    child.stdout?.on('data', forward);
    child.stderr?.on('data', forward);
    this.exited = new Promise((resolve) => {
      child.once('error', (error) => {
        this.exitMessage = `Could not start the backend: ${error.message}`;
        resolve();
      });
      child.once('exit', (code, signal) => {
        this.exitMessage ??= `The backend exited (code ${code}, signal ${signal})`;
        resolve();
      });
    });
    void this.exited.then(() => {
      if (this.status && !this.stopping) this.params.onUnexpectedExit(this.exitMessage ?? 'The backend exited');
    });

    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (this.exitMessage) throw new Error(this.exitMessage);
      // oxlint-disable-next-line no-await-in-loop -- polling
      const status = await readStatusFile(this.params.statusFile);
      if (status) {
        this.status = status;
        return status;
      }
      // oxlint-disable-next-line no-await-in-loop -- polling
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error('The backend did not become ready in time');
  }

  /** Graceful stop through the control route (a signal is a hard kill on Windows), then a kill. Idempotent. */
  async stop(): Promise<void> {
    if (this.stopping || !this.child) return;
    this.stopping = true;
    if (this.status) {
      await fetch(`${this.status.internalUrl}/internal/local/shutdown`, {
        method: 'POST',
        headers: { 'x-local-control-token': this.status.controlToken },
      }).catch(() => null);
    }
    const exitedInTime = await Promise.race([this.exited.then(() => true), sleep(STOP_TIMEOUT_MS).then(() => false)]);
    if (!exitedInTime) this.child.kill();
    await this.exited;
  }
}

import { existsSync } from 'node:fs';
import type { ITemporalServerControl } from '@falang/workflow-backend';
import {
  startTemporalDevServer,
  type IStartTemporalDevServerParams,
  type ITemporalDevServer,
} from './temporal-dev-server.js';

export interface IOnDemandTemporalServerParams {
  /** Resolves the `temporal` CLI (finding or downloading it); called on every start attempt until one succeeds. */
  readonly resolveCli: () => Promise<string>;
  readonly dbFile: string;
  readonly ip: string;
  /** Picked up front, so `TEMPORAL_ADDRESS` (backend and runners) is known before the server exists. */
  readonly port: number;
  /** `null` = headless. */
  readonly uiPort: number | null;
  readonly log?: (line: string) => void;
  /** The server died on its own after it had been started (not through `stop()`). */
  readonly onUnexpectedExit?: (error: Error) => void;
  /** Test seams. */
  readonly start?: (params: IStartTemporalDevServerParams) => Promise<ITemporalDevServer>;
  readonly fileExists?: (path: string) => boolean;
}

/**
 * The Temporal dev server of local mode, started only when something needs it (ADR 0072, private): the first runner
 * process (a dev stand, a production version, a woken trigger) or a read of runs that already exist. Implements the
 * backend's `ITemporalServerControl`; the address and UI URL are fixed at construction.
 */
export class OnDemandTemporalServer implements ITemporalServerControl {
  readonly address: string;
  readonly uiUrl: string | null;
  private readonly params: IOnDemandTemporalServerParams;
  private server: ITemporalDevServer | null = null;
  private starting: Promise<void> | null = null;
  private stopped = false;

  constructor(params: IOnDemandTemporalServerParams) {
    this.params = params;
    this.address = `${params.ip}:${params.port}`;
    this.uiUrl = params.uiPort === null ? null : `http://${params.ip}:${params.uiPort}`;
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  /** The dev server keeps everything in its SQLite file, which exists from its first start on. */
  hasStoredState(): boolean {
    return (this.params.fileExists ?? existsSync)(this.params.dbFile);
  }

  ensureStarted(): Promise<void> {
    if (this.server) return Promise.resolve();
    if (this.stopped) return Promise.reject(new Error('The Temporal dev server has been stopped'));
    this.starting ??= this.startOnce().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.starting?.catch(() => null);
    const { server } = this;
    this.server = null;
    await server?.stop();
  }

  private async startOnce(): Promise<void> {
    const log = this.params.log ?? (() => null);
    const cliPath = await this.params.resolveCli();
    log('[local] starting the Temporal dev server');
    const server = await (this.params.start ?? startTemporalDevServer)({
      cliPath,
      dbFile: this.params.dbFile,
      ip: this.params.ip,
      port: this.params.port,
      ...(this.params.uiPort === null ? { headless: true } : { uiPort: this.params.uiPort }),
      log,
    });
    if (this.stopped) {
      await server.stop();
      throw new Error('The Temporal dev server has been stopped');
    }
    this.server = server;
    server.exited.then(
      ({ code, signal }) => {
        if (this.server !== server) return;
        this.server = null;
        this.params.onUnexpectedExit?.(
          new Error(`The Temporal dev server exited unexpectedly (code ${code}, signal ${signal})`),
        );
      },
      () => null,
    );
  }
}

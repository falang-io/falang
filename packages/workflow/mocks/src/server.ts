import type { Server } from 'node:http';
import type { Express } from 'express';
import { createMocksApp, type MockRegistration } from './app.js';

export interface IStartMocksServerOptions {
  /** Defaults to 0 (ephemeral). */
  readonly port?: number;
  readonly extraMocks?: readonly MockRegistration[];
}

export interface IMocksServer {
  readonly app: Express;
  readonly server: Server;
  readonly close: () => Promise<void>;
}

export const startMocksServer = (options: IStartMocksServerOptions = {}): Promise<IMocksServer> =>
  new Promise((resolve, reject) => {
    const app = createMocksApp({ extraMocks: options.extraMocks });
    const server = app.listen(options.port ?? 0, () => {
      resolve({
        app,
        server,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
            server.closeAllConnections();
          }),
      });
    });
    server.on('error', reject);
  });

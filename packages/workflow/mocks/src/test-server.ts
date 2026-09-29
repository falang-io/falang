import type { Server } from 'node:http';
import { createApp } from './app.js';

export interface ITestServer {
  readonly url: string;
  readonly close: () => Promise<void>;
}

/** Starts `createApp()` on an ephemeral port for a test — no Docker/real network needed. */
export const startTestServer = (): Promise<ITestServer> =>
  new Promise((resolve) => {
    const server: Server = createApp().listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((res) => {
            server.close(() => res());
          }),
      });
    });
  });

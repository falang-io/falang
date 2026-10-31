import net from 'node:net';

const canListen = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });

export const findFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });

/**
 * The browser origin changes with the port, and the client keeps its UI state per origin: reuse the previous port while
 * it is free, otherwise pick a new one.
 */
export const pickPublicPort = async (previous: number | null): Promise<number> => {
  if (previous !== null && (await canListen(previous))) return previous;
  return findFreePort();
};

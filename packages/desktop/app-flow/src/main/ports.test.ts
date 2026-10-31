// oxlint-disable unicorn/no-await-expression-member, init-declarations, no-bitwise, unicorn/no-array-sort, no-undefined, no-void, no-promise-executor-return
import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { findFreePort, pickPublicPort } from './ports.js';

const listen = (port: number): Promise<net.Server> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
const close = (server: net.Server): Promise<void> => new Promise((resolve) => server.close(() => resolve()));

describe('ports', () => {
  it('findFreePort returns a port that can then be listened on', async () => {
    const port = await findFreePort();
    expect(port).toBeGreaterThan(0);
    await close(await listen(port));
  });

  it('pickPublicPort reuses the previous port while it is free', async () => {
    const previous = await findFreePort();
    expect(await pickPublicPort(previous)).toBe(previous);
  });

  it('pickPublicPort picks another port when the previous one is busy, and a free one for null', async () => {
    const busy = await listen(0);
    const busyPort = (busy.address() as net.AddressInfo).port;
    try {
      const picked = await pickPublicPort(busyPort);
      expect(picked).not.toBe(busyPort);
      expect(picked).toBeGreaterThan(0);
    } finally {
      await close(busy);
    }
    expect(await pickPublicPort(null)).toBeGreaterThan(0);
  });
});

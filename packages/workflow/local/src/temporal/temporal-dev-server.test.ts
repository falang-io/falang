import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { buildDevServerArgs, startTemporalDevServer } from './temporal-dev-server.js';
import type { ITemporalDevServerChild } from './temporal-dev-server.js';

const fakeChild = () => {
  // oxlint-disable-next-line unicorn/prefer-event-target -- fake of ChildProcess, which is an EventEmitter
  const ee = new EventEmitter();
  const kills: (string | number | undefined)[] = [];
  const child = {
    stdout: null,
    stderr: null,
    exitCode: null,
    kill: (s?: NodeJS.Signals | number) => {
      kills.push(s);
      ee.emit('exit', null, 'SIGTERM');
      return true;
    },
    once: (e: 'exit', l: (c: number | null, s: NodeJS.Signals | null) => void) => ee.once(e, l),
  } as ITemporalDevServerChild;
  return { child, ee, kills };
};

describe('buildDevServerArgs', () => {
  it('assembles flags', () => {
    const args = buildDevServerArgs({
      dbFile: '/db',
      ip: '127.0.0.1',
      port: 1,
      uiPort: null,
      namespace: 'default',
      dynamicConfig: { 'a.b': 'true' },
    });
    expect(args).toEqual([
      'server',
      'start-dev',
      '--db-filename',
      '/db',
      '--ip',
      '127.0.0.1',
      '--port',
      '1',
      '--headless',
      '--namespace',
      'default',
      '--log-level',
      'warn',
      '--dynamic-config-value',
      'a.b=true',
    ]);
  });
});

describe('startTemporalDevServer', () => {
  it('waits for the port and stops idempotently', async () => {
    const f = fakeChild();
    let probes = 0;
    const server = await startTemporalDevServer({
      cliPath: 'temporal',
      dbFile: '/db',
      port: 7000,
      headless: true,
      spawn: () => f.child,
      probe: () => {
        probes += 1;
        return Promise.resolve(probes >= 3);
      },
    });
    expect(server.address).toBe('127.0.0.1:7000');
    expect(server.uiUrl).toBeNull();
    expect(probes).toBe(3);
    await server.stop();
    await server.stop();
    expect(f.kills).toHaveLength(1);
  });
  it('rejects when the process exits first', async () => {
    const f = fakeChild();
    const p = startTemporalDevServer({
      cliPath: 'temporal',
      dbFile: '/db',
      port: 7000,
      headless: true,
      spawn: () => f.child,
      probe: () => {
        f.ee.emit('exit', 1, null);
        return Promise.resolve(false);
      },
    });
    await expect(p).rejects.toThrow(/exited/);
  });
  it('times out', async () => {
    const f = fakeChild();
    await expect(
      startTemporalDevServer({
        cliPath: 'temporal',
        dbFile: '/db',
        port: 7000,
        headless: true,
        startTimeoutMs: 150,
        spawn: () => f.child,
        probe: () => Promise.resolve(false),
      }),
    ).rejects.toThrow(/did not open/);
  });
});

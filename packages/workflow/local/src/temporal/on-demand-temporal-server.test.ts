import { describe, expect, it, vi } from 'vitest';
import { OnDemandTemporalServer } from './on-demand-temporal-server.js';
import type { IStartTemporalDevServerParams, ITemporalDevServer } from './temporal-dev-server.js';

interface IExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

const fakeDevServer = () => {
  const exit: { resolve: ((value: IExit) => void) | null } = { resolve: null };
  const exited = new Promise<IExit>((resolve) => {
    exit.resolve = resolve;
  });
  const stop = vi.fn(() => {
    exit.resolve?.({ code: 0, signal: null });
    return Promise.resolve();
  });
  const server: ITemporalDevServer = { address: '127.0.0.1:7233', uiUrl: null, exited, stop };
  return { server, stop, crash: () => exit.resolve?.({ code: 1, signal: null }) };
};

const build = (overrides: { start?: (p: IStartTemporalDevServerParams) => Promise<ITemporalDevServer> } = {}) => {
  const dev = fakeDevServer();
  const start = vi.fn(overrides.start ?? (() => Promise.resolve(dev.server)));
  const resolveCli = vi.fn().mockResolvedValue('/bin/temporal');
  const onUnexpectedExit = vi.fn();
  const server = new OnDemandTemporalServer({
    resolveCli,
    dbFile: '/data/temporal/temporal.db',
    ip: '127.0.0.1',
    port: 7233,
    uiPort: 8233,
    start,
    fileExists: (file) => file === '/data/temporal/temporal.db',
    onUnexpectedExit,
  });
  return { server, start, resolveCli, onUnexpectedExit, dev };
};

describe('OnDemandTemporalServer', () => {
  it('knows its address and UI URL before it starts, and starts nothing by itself', () => {
    const { server, start, resolveCli } = build();
    expect(server.address).toBe('127.0.0.1:7233');
    expect(server.uiUrl).toBe('http://127.0.0.1:8233');
    expect(server.isRunning()).toBe(false);
    expect(server.hasStoredState()).toBe(true);
    expect(start).not.toHaveBeenCalled();
    expect(resolveCli).not.toHaveBeenCalled();
  });

  it('starts once for concurrent callers, with the pre-picked ports', async () => {
    const { server, start } = build();
    await Promise.all([server.ensureStarted(), server.ensureStarted()]);
    await server.ensureStarted();
    expect(start).toHaveBeenCalledOnce();
    expect(start.mock.calls[0]?.[0]).toMatchObject({ cliPath: '/bin/temporal', port: 7233, uiPort: 8233 });
    expect(server.isRunning()).toBe(true);
  });

  it('retries a failed start on the next call', async () => {
    const dev = fakeDevServer();
    const start = vi.fn().mockRejectedValueOnce(new Error('port busy')).mockResolvedValue(dev.server);
    const { server } = build({ start });
    await expect(server.ensureStarted()).rejects.toThrow('port busy');
    expect(server.isRunning()).toBe(false);
    await server.ensureStarted();
    expect(server.isRunning()).toBe(true);
  });

  it('reports a crash, not a stop', async () => {
    const { server, onUnexpectedExit, dev } = build();
    await server.ensureStarted();
    dev.crash();
    await vi.waitFor(() => expect(onUnexpectedExit).toHaveBeenCalledOnce());
    expect(server.isRunning()).toBe(false);

    const second = build();
    await second.server.ensureStarted();
    await second.server.stop();
    expect(second.dev.stop).toHaveBeenCalledOnce();
    expect(second.onUnexpectedExit).not.toHaveBeenCalled();
    await expect(second.server.ensureStarted()).rejects.toThrow(/stopped/);
  });

  it('stop() before any start does nothing', async () => {
    const { server, start } = build();
    await server.stop();
    expect(start).not.toHaveBeenCalled();
  });
});

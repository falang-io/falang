// oxlint-disable no-undefined, unicorn/no-useless-undefined -- test fixtures: explicit "no value" fixtures, fake-timer scaffolding and long per-case suites.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IRunnerConfig } from './runner-config.js';
import {
  connectRunnerToTemporal,
  type IRunnerTemporalConnection,
  type IRunnerTemporalConnectionDeps,
} from './temporal-connection.js';
import type { ITemporalToken } from './temporal-token-refresher.js';

const baseConfig: IRunnerConfig = {
  artifactBaseUrl: 'http://backend:3001',
  projectId: 'p1',
  internalProjectToken: 'pod-token',
  taskQueue: 'workflow-p1',
  temporalAddress: 'temporal:7233',
  namespace: 'falang-p1',
  temporalTokenUrl: 'http://backend:3001/internal/projects/p1/temporal-token',
  temporalTls: false,
};

interface IFakeConnection extends IRunnerTemporalConnection {
  setApiKey: ReturnType<typeof vi.fn<(apiKey: string) => Promise<void>>>;
  close: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

const setup = (fetchToken?: IRunnerTemporalConnectionDeps<IFakeConnection>['fetchToken']) => {
  const connection: IFakeConnection = {
    setApiKey: vi.fn<(apiKey: string) => Promise<void>>(() => Promise.resolve()),
    close: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  };
  let counter = 0;
  const deps: IRunnerTemporalConnectionDeps<IFakeConnection> = {
    connect: vi.fn().mockResolvedValue(connection),
    fetchToken:
      fetchToken ??
      vi.fn((): Promise<ITemporalToken> => {
        counter += 1;
        return Promise.resolve({ token: `jwt-${counter}`, expiresAt: new Date(Date.now() + 100_000).toISOString() });
      }),
    sleep: vi.fn().mockResolvedValue(undefined),
    onFatal: vi.fn(),
    log: vi.fn(),
  };
  return { connection, deps };
};

describe('connectRunnerToTemporal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects with the project token as apiKey and tls pinned off (the SDK would otherwise default TLS on)', async () => {
    const { deps } = setup();

    await connectRunnerToTemporal(baseConfig, deps);

    expect(deps.fetchToken).toHaveBeenCalledWith(baseConfig.temporalTokenUrl, 'pod-token');
    expect(deps.connect).toHaveBeenCalledWith({ address: 'temporal:7233', apiKey: 'jwt-1', tls: false });
  });

  it('connects with TLS when TEMPORAL_TLS=true', async () => {
    const { deps } = setup();

    await connectRunnerToTemporal({ ...baseConfig, temporalTls: true }, deps);

    expect(deps.connect).toHaveBeenCalledWith({ address: 'temporal:7233', apiKey: 'jwt-1', tls: true });
  });

  it('refreshes the token on the live connection by timer, without reconnecting', async () => {
    const { connection, deps } = setup();
    const handle = await connectRunnerToTemporal(baseConfig, deps);

    await vi.advanceTimersByTimeAsync(50_100);
    expect(connection.setApiKey).toHaveBeenCalledWith('jwt-2');
    await vi.advanceTimersByTimeAsync(50_000);
    expect(connection.setApiKey).toHaveBeenCalledWith('jwt-3');

    expect(deps.connect).toHaveBeenCalledTimes(1);
    await handle?.close();
  });

  it('keeps the connection alive through a failed refresh', async () => {
    let call = 0;
    const { connection, deps } = setup(() => {
      call += 1;
      if (call === 2) return Promise.reject(new Error('backend restarting'));
      return Promise.resolve({ token: `jwt-${call}`, expiresAt: new Date(Date.now() + 100_000).toISOString() });
    });
    const handle = await connectRunnerToTemporal(baseConfig, deps);

    await vi.advanceTimersByTimeAsync(50_100 + 5100);

    expect(connection.setApiKey).toHaveBeenCalledWith('jwt-3');
    expect(deps.onFatal).not.toHaveBeenCalled();
    await handle?.close();
  });

  it('calls onFatal when the refresh keeps failing', async () => {
    let call = 0;
    const { deps } = setup(() => {
      call += 1;
      return call === 1
        ? Promise.resolve({ token: 'jwt-1', expiresAt: new Date(Date.now() + 100_000).toISOString() })
        : Promise.reject(new Error('403'));
    });
    await connectRunnerToTemporal(baseConfig, deps);

    await vi.advanceTimersByTimeAsync(50_100 + 5 * 5100);

    expect(deps.onFatal).toHaveBeenCalledTimes(1);
  });

  it('stops the refresh timer and closes the connection on shutdown', async () => {
    const { connection, deps } = setup();
    const handle = await connectRunnerToTemporal(baseConfig, deps);

    await handle?.close();

    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(500_000);
    expect(connection.setApiKey).not.toHaveBeenCalled();
  });

  it('retries the initial token fetch, then fails if backend never answers', async () => {
    const fetchToken = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const { deps } = setup(fetchToken);

    await expect(connectRunnerToTemporal(baseConfig, deps)).rejects.toThrow('ECONNREFUSED');

    expect(fetchToken).toHaveBeenCalledTimes(6);
    expect(deps.connect).not.toHaveBeenCalled();
  });

  it('retries the initial token fetch and succeeds once backend is up', async () => {
    const fetchToken = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ token: 'jwt-ok', expiresAt: new Date(Date.now() + 100_000).toISOString() });
    const { deps } = setup(fetchToken);

    await connectRunnerToTemporal(baseConfig, deps);

    expect(deps.connect).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'jwt-ok' }));
  });

  it('shared mode (no token URL): the same tokenless connection as before isolation existed, nothing scheduled', async () => {
    const { deps } = setup();

    const handle = await connectRunnerToTemporal(
      { ...baseConfig, temporalTokenUrl: undefined, temporalTls: undefined, namespace: 'default' },
      deps,
    );

    expect(deps.fetchToken).not.toHaveBeenCalled();
    expect(deps.connect).toHaveBeenCalledWith({ address: 'temporal:7233' });
    expect(vi.getTimerCount()).toBe(0);
    await handle?.close();
  });

  it('does not connect at all without a Temporal address', async () => {
    const { deps } = setup();

    expect(await connectRunnerToTemporal({ ...baseConfig, temporalAddress: undefined }, deps)).toBeNull();
    expect(deps.connect).not.toHaveBeenCalled();
  });
});

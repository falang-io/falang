// oxlint-disable no-undefined, unicorn/no-useless-undefined, no-unsafe-optional-chaining, unicorn/consistent-function-scoping -- test fixtures: explicit "no value" fixtures, fake-timer scaffolding and long per-case suites.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchTemporalToken,
  TemporalTokenRefresher,
  type ITemporalToken,
  type TFetchTemporalToken,
} from './temporal-token-refresher.js';

const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);

const tokenValidFor = (seconds: number, name: string, from: number = Date.now()): ITemporalToken => ({
  token: name,
  expiresAt: new Date(from + seconds * 1000).toISOString(),
});

describe('TemporalTokenRefresher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (
    overrides: { fetchToken?: TFetchTemporalToken; applyToken?: (token: string) => Promise<void> } = {},
  ) => {
    let counter = 0;
    const fetchToken = vi.fn<TFetchTemporalToken>(
      overrides.fetchToken ??
        (() => {
          counter += 1;
          return Promise.resolve(tokenValidFor(100, `token-${counter}`));
        }),
    );
    const applyToken = vi.fn<(token: string) => Promise<void>>(overrides.applyToken ?? (() => Promise.resolve()));
    const onFatal = vi.fn();
    const refresher = new TemporalTokenRefresher({
      initial: tokenValidFor(100, 'initial'),
      fetchToken,
      applyToken,
      onFatal,
      maxConsecutiveFailures: 3,
      retryDelayMs: 5000,
    });
    return { refresher, fetchToken, applyToken, onFatal };
  };

  it('refreshes at half the token lifetime and pushes the new token into the connection', async () => {
    const { refresher, fetchToken, applyToken } = setup();
    refresher.start();

    await vi.advanceTimersByTimeAsync(49_000);
    expect(fetchToken).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1100);
    expect(fetchToken).toHaveBeenCalledTimes(1);
    expect(applyToken).toHaveBeenCalledWith('token-1');
    refresher.stop();
  });

  it('keeps refreshing on a fresh half-TTL schedule, again and again', async () => {
    const { refresher, applyToken } = setup();
    refresher.start();

    await vi.advanceTimersByTimeAsync(50_000 + 50_000 + 50_000 + 100);

    expect(applyToken.mock.calls.map(([token]) => token)).toEqual(['token-1', 'token-2', 'token-3']);
    refresher.stop();
  });

  it('survives a failed refresh: retries sooner, recovers, and never gives up while it succeeds', async () => {
    let call = 0;
    const { refresher, applyToken, onFatal } = setup({
      fetchToken: () => {
        call += 1;
        return call === 1
          ? Promise.reject(new Error('backend restarting'))
          : Promise.resolve(tokenValidFor(100, `token-${call}`));
      },
    });
    refresher.start();

    await vi.advanceTimersByTimeAsync(50_100);
    expect(applyToken).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5100);

    expect(applyToken).toHaveBeenCalledWith('token-2');
    expect(onFatal).not.toHaveBeenCalled();
    refresher.stop();
  });

  it('does not count a failure that is followed by a success against the limit', async () => {
    let call = 0;
    const { refresher, onFatal } = setup({
      fetchToken: () => {
        call += 1;
        // fail, fail, succeed, fail, fail, succeed ... never 3 in a row
        return call % 3 === 0 ? Promise.resolve(tokenValidFor(100, `t${call}`)) : Promise.reject(new Error('flaky'));
      },
    });
    refresher.start();

    await vi.advanceTimersByTimeAsync(300_000);

    expect(onFatal).not.toHaveBeenCalled();
    refresher.stop();
  });

  it('ends the process (onFatal) once refreshing fails the configured number of times in a row', async () => {
    const { refresher, fetchToken, onFatal } = setup({
      fetchToken: () => Promise.reject(new Error('403 from backend')),
    });
    refresher.start();

    await vi.advanceTimersByTimeAsync(50_100 + 5100 + 5100);

    expect(fetchToken).toHaveBeenCalledTimes(3);
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect((onFatal.mock.calls[0]?.[0] as Error).message).toMatch(/could not be refreshed.*403 from backend/);

    // And it stays dead: no further attempts after the fatal.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchToken).toHaveBeenCalledTimes(3);
  });

  it('ends the process as soon as a failed refresh finds the held token already expired', async () => {
    const { refresher, onFatal } = setup({ fetchToken: () => Promise.reject(new Error('backend down')) });
    // initial token valid for 100s; failures retry every ~5s, so it is first checked after expiry only if retries stop early.
    const params = {
      initial: tokenValidFor(2, 'short'),
      fetchToken: () => Promise.reject(new Error('backend down')),
      applyToken: () => Promise.resolve(),
      onFatal,
      maxConsecutiveFailures: 50,
    };
    const short = new TemporalTokenRefresher(params);
    short.start();

    await vi.advanceTimersByTimeAsync(5000);

    expect(onFatal).toHaveBeenCalledTimes(1);
    expect((onFatal.mock.calls[0]?.[0] as Error).message).toMatch(/token expired/);
    refresher.stop();
  });

  it('treats a failing applyToken like a failed refresh', async () => {
    const { refresher, onFatal } = setup({ applyToken: () => Promise.reject(new Error('connection closed')) });
    refresher.start();

    await vi.advanceTimersByTimeAsync(50_100 + 5100 + 5100);

    expect(onFatal).toHaveBeenCalledTimes(1);
  });

  it('stops its timer on shutdown: no refresh after stop()', async () => {
    const { refresher, fetchToken } = setup();
    refresher.start();

    refresher.stop();
    await vi.advanceTimersByTimeAsync(500_000);

    expect(fetchToken).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not reschedule after stop() even if a refresh was in flight', async () => {
    let release: () => void = () => undefined;
    const { refresher, fetchToken } = setup({
      fetchToken: () =>
        new Promise<ITemporalToken>((resolve) => {
          release = () => resolve(tokenValidFor(100, 'late'));
        }),
    });
    refresher.start();
    await vi.advanceTimersByTimeAsync(50_100);
    expect(fetchToken).toHaveBeenCalledTimes(1);

    refresher.stop();
    release();
    await vi.advanceTimersByTimeAsync(200_000);

    expect(fetchToken).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('fetchTemporalToken', () => {
  const okResponse = (body: unknown): Response =>
    ({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(''),
    }) as unknown as Response;

  it("POSTs to the token URL with the pod's own project token and returns the minted token", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(okResponse({ token: 'jwt', expiresAt: '2026-10-01T13:00:00.000Z' })));

    const token = await fetchTemporalToken(
      'http://backend:3001/internal/projects/p1/temporal-token',
      'pod-token',
      fetchImpl as unknown as typeof fetch,
    );

    expect(token).toEqual({ token: 'jwt', expiresAt: '2026-10-01T13:00:00.000Z' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://backend:3001/internal/projects/p1/temporal-token');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'x-internal-project-token': 'pod-token' });
  });

  it('throws with the status and body on a non-2xx answer (e.g. a 403 for a wrong project token)', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden resource'),
      } as unknown as Response),
    );

    await expect(fetchTemporalToken('http://b/x', 't', fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      /403 Forbidden resource/,
    );
  });

  it('rejects a malformed body', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(okResponse({ token: 'jwt' })));

    await expect(fetchTemporalToken('http://b/x', 't', fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      /malformed/,
    );
  });
});

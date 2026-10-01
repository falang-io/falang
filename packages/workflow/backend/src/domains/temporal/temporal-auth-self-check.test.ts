import { describe, expect, it, vi } from 'vitest';
import { checkTemporalAuthorizationEnforced, type TAuthProbe } from './temporal-auth-self-check.js';

const denied = (code = 7): Error => Object.assign(new Error('Request unauthorized.'), { code });
const unreachable = (): Error => Object.assign(new Error('connect ECONNREFUSED'), { code: 14 });

const run = (anonymous: TAuthProbe, foreignToken: TAuthProbe, timeoutMs = 10_000) => {
  let clock = 0;
  const sleep = vi.fn((ms: number) => {
    clock += ms;
    return Promise.resolve();
  });
  return {
    sleep,
    outcome: checkTemporalAuthorizationEnforced(
      { anonymous, foreignToken },
      { timeoutMs, retryDelayMs: 1000, sleep, now: () => clock },
    ),
  };
};

describe('checkTemporalAuthorizationEnforced', () => {
  it('reports enforced when both a tokenless and a foreign-token request are refused', async () => {
    const { outcome } = run(
      () => Promise.reject(denied(7)),
      () => Promise.reject(denied(16)),
    );

    expect(await outcome).toEqual({ status: 'enforced' });
  });

  it('reports not-enforced, naming the probe, when a tokenless request is answered (server without an authorizer)', async () => {
    const { outcome } = run(
      () => Promise.resolve(),
      () => Promise.reject(denied()),
    );

    expect(await outcome).toEqual({ status: 'not-enforced', failed: ['anonymous'] });
  });

  it('reports not-enforced when a request signed by an untrusted key is accepted', async () => {
    const { outcome } = run(
      () => Promise.reject(denied()),
      () => Promise.resolve(),
    );

    expect(await outcome).toEqual({ status: 'not-enforced', failed: ['foreignToken'] });
  });

  it('names both probes when neither is refused', async () => {
    const { outcome } = run(
      () => Promise.resolve(),
      () => Promise.resolve(),
    );

    expect(await outcome).toEqual({ status: 'not-enforced', failed: ['anonymous', 'foreignToken'] });
  });

  it('retries while Temporal is still starting, then reports the real answer', async () => {
    const anonymous = vi
      .fn<TAuthProbe>()
      .mockRejectedValueOnce(unreachable())
      .mockRejectedValueOnce(unreachable())
      .mockRejectedValue(denied());
    const { outcome, sleep } = run(anonymous, () => Promise.reject(denied()));

    expect(await outcome).toEqual({ status: 'enforced' });
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('gives up as unreachable after the timeout instead of failing instantly or claiming enforcement', async () => {
    const { outcome } = run(
      () => Promise.reject(unreachable()),
      () => Promise.reject(unreachable()),
      3000,
    );

    expect(await outcome).toEqual({ status: 'unreachable', message: 'connect ECONNREFUSED' });
  });

  it('does not run the foreign-token probe while the server is unreachable', async () => {
    const foreign = vi.fn<TAuthProbe>(() => Promise.reject(denied()));
    const { outcome } = run(() => Promise.reject(unreachable()), foreign, 2000);

    await outcome;
    expect(foreign).not.toHaveBeenCalled();
  });
});

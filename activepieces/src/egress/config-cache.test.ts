import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEgressConfigCache } from './config-cache.js';

const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe('createEgressConfigCache (edge cases)', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('does nothing without a project token', async () => {
    const fetchImpl = vi.fn();
    const cache = createEgressConfigCache({ backendUrl: 'http://b', fetchImpl: fetchImpl as unknown as typeof fetch });
    await cache.refresh('p', '');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('shares one in-flight request between concurrent refreshes and url-encodes the project id', async () => {
    const fetchImpl = vi.fn(async () => okResponse({ proxy: null }));
    const cache = createEgressConfigCache({
      backendUrl: 'http://b///',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await Promise.all([cache.refresh('a/b', 't'), cache.refresh('a/b', 't')]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('http://b/internal/egress-proxy/a%2Fb');
  });

  it('treats a missing proxy as "no proxy" and drops a previously cached one', async () => {
    let now = 0;
    let body: unknown = { proxy: { url: 'http://p', token: 't', vendors: ['v'] } };
    const cache = createEgressConfigCache({
      backendUrl: 'http://b',
      now: () => now,
      fetchImpl: (async () => okResponse(body)) as unknown as typeof fetch,
    });
    await cache.refresh('p', 't');
    expect(cache.get()?.url).toBe('http://p');
    now = 60_000;
    body = {};
    await cache.refresh('p', 't');
    expect(cache.get()).toBeNull();
  });

  it('keeps the last value, warns once per failure streak and backs off for the TTL on a non-ok status', async () => {
    let now = 0;
    let ok = true;
    const fetchImpl = vi.fn(async () =>
      ok ? okResponse({ proxy: { url: 'http://p', token: 't', vendors: [] } }) : { ok: false, status: 503 },
    );
    const cache = createEgressConfigCache({
      backendUrl: 'http://b',
      now: () => now,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await cache.refresh('p', 't');
    ok = false;
    now = 31_000;
    await cache.refresh('p', 't');
    await cache.refresh('p', 't'); // within TTL of the failed attempt: no hammering
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    now = 62_000;
    await cache.refresh('p', 't');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(1); // one warning for the whole streak
    expect(cache.get()?.url).toBe('http://p');
    ok = true;
    now = 100_000;
    await cache.refresh('p', 't');
    ok = false;
    now = 140_000;
    await cache.refresh('p', 't');
    expect(warn).toHaveBeenCalledTimes(2); // a new streak warns again
  });

  it('fails soft without BACKEND_INTERNAL_URL', async () => {
    const cache = createEgressConfigCache({ backendUrl: undefined });
    await expect(cache.refresh('p', 't')).resolves.toBeUndefined();
    expect(cache.get()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

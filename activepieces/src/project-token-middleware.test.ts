import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearProjectTokenCache, requireProjectToken } from './project-token-middleware.js';

const makeReq = (projectId: unknown, token?: string): Request =>
  ({ body: { projectId }, header: () => token }) as unknown as Request;

interface IRes {
  readonly res: Response;
  readonly status: ReturnType<typeof vi.fn>;
  readonly locals: Record<string, unknown>;
}
const makeRes = (): IRes => {
  const locals: Record<string, unknown> = {};
  const status = vi.fn();
  const res = { locals, status, json: vi.fn() } as unknown as Response;
  status.mockReturnValue(res);
  return { res, status, locals };
};

const run = async (projectId: unknown, token?: string) => {
  const { res, status, locals } = makeRes();
  const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
  await requireProjectToken(makeReq(projectId, token), res, next);
  return { status, locals, next };
};

describe('requireProjectToken', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.internal');
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    clearProjectTokenCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('401 without a token or a projectId, never calling the backend', async () => {
    for (const [projectId, token] of [
      ['p1', undefined],
      ['', 'tok'],
      [undefined, 'tok'],
      [42, 'tok'],
    ] as const) {
      const { status, next } = await run(projectId, token);
      expect(status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('401 when the backend rejects the token', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const { status, next, locals } = await run('p1', 'bad');
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(locals['internalProjectToken']).toBeUndefined();
  });

  it('verifies against the backend and exposes only the verified token', async () => {
    const { next, locals } = await run('p1', 'tok');
    expect(next).toHaveBeenCalledTimes(1);
    expect(locals['internalProjectToken']).toBe('tok');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://backend.internal/internal/auth/verify-project-token');
    expect(init.headers['x-internal-project-token']).toBe('tok');
    expect(JSON.parse(init.body)).toEqual({ projectId: 'p1' });
  });

  it('fails closed with 503 when the backend is unreachable, and caches nothing', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const first = await run('p1', 'tok');
    expect(first.status).toHaveBeenCalledWith(503);
    expect(first.next).not.toHaveBeenCalled();

    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const second = await run('p1', 'tok');
    expect(second.status).toHaveBeenCalledWith(503);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails closed with 503 when BACKEND_INTERNAL_URL is not configured', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', '');
    const { status, next } = await run('p1', 'tok');
    expect(status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('positive cache (60 s)', () => {
    it('serves a verified pair from cache without asking the backend again', async () => {
      await run('p1', 'tok');
      const again = await run('p1', 'tok');
      expect(again.next).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not let a token verified for project A act as project B', async () => {
      await run('A', 'tok');
      fetchMock.mockResolvedValue({ ok: false });
      const other = await run('B', 'tok');
      expect(other.status).toHaveBeenCalledWith(401);
      expect(other.next).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not let another token of the same project ride on the cached one', async () => {
      await run('A', 'tok-1');
      fetchMock.mockResolvedValue({ ok: false });
      const other = await run('A', 'tok-2');
      expect(other.status).toHaveBeenCalledWith(401);
    });

    it('re-verifies after the TTL, and a revoked token is then refused', async () => {
      await run('p1', 'tok');
      vi.advanceTimersByTime(60_001);
      fetchMock.mockResolvedValue({ ok: false });
      const later = await run('p1', 'tok');
      expect(later.status).toHaveBeenCalledWith(401);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('still serves from cache just before the TTL', async () => {
      await run('p1', 'tok');
      vi.advanceTimersByTime(59_000);
      await run('p1', 'tok');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('sweeps expired entries when the cache is full, keeping live ones cached', async () => {
      for (let index = 0; index < 500; index += 1) await run(`old${index}`, 'tok');
      vi.advanceTimersByTime(61_000);
      for (let index = 0; index < 500; index += 1) await run(`live${index}`, 'tok');
      await run('extra', 'tok'); // the cache is full: expired entries are swept
      fetchMock.mockClear();
      const live = await run('live0', 'tok');
      expect(live.next).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('over 1000 entries the oldest is evicted (so it is re-verified), never the new one admitted unchecked', async () => {
      await run('first', 'tok');
      for (let index = 0; index < 1000; index += 1) await run(`p${index}`, 'tok');
      expect(fetchMock).toHaveBeenCalledTimes(1001);

      // `first` was evicted: it must hit the backend again — and be refused if the backend now says no.
      fetchMock.mockResolvedValue({ ok: false });
      const evicted = await run('first', 'tok');
      expect(fetchMock).toHaveBeenCalledTimes(1002);
      expect(evicted.status).toHaveBeenCalledWith(401);

      // the most recent entry is still cached
      fetchMock.mockClear();
      const recent = await run('p999', 'tok');
      expect(recent.next).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
